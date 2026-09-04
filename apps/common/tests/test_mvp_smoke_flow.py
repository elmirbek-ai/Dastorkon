from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.orders.models import CartItem, Order
from apps.tables.models import (
    ActiveTableSession,
    CustomerSession,
    RestaurantTable,
)


User = get_user_model()


class MvpSmokeFlowTests(APITestCase):
    def setUp(self):
        User.objects.create_user(
            username="admin",
            password="admin-password",
            role=User.Role.ADMIN,
        )

    def jwt_client(self, username, password):
        token_client = APIClient()
        response = token_client.post(
            "/api/auth/token/",
            {"username": username, "password": password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return client

    def assert_status(self, response, expected):
        self.assertEqual(response.status_code, expected, response.data)

    def test_complete_mvp_api_flow(self):
        admin_client = self.jwt_client("admin", "admin-password")

        restaurant_response = admin_client.post(
            "/api/admin/restaurants/",
            {
                "name": "Dastorkon",
                "address": "Bishkek",
                "phone": "+996700000000",
            },
            format="json",
        )
        self.assert_status(restaurant_response, status.HTTP_201_CREATED)
        restaurant_id = restaurant_response.data["id"]

        settings_url = f"/api/admin/restaurants/{restaurant_id}/settings/"
        settings_response = admin_client.get(settings_url)
        self.assert_status(settings_response, status.HTTP_200_OK)
        settings_response = admin_client.patch(
            settings_url,
            {
                "comments_enabled": False,
                "default_language": "RU",
                "currency": "KGS",
            },
            format="json",
        )
        self.assert_status(settings_response, status.HTTP_200_OK)
        self.assertFalse(settings_response.data["comments_enabled"])

        category_response = admin_client.post(
            "/api/admin/categories/",
            {
                "restaurant": restaurant_id,
                "name_ky": "Негизги тамактар",
                "name_ru": "Основные блюда",
            },
            format="json",
        )
        self.assert_status(category_response, status.HTTP_201_CREATED)

        menu_item_response = admin_client.post(
            "/api/admin/menu-items/",
            {
                "restaurant": restaurant_id,
                "category": category_response.data["id"],
                "name_ky": "Палоо",
                "name_ru": "Плов",
                "price": "250.00",
            },
            format="json",
        )
        self.assert_status(menu_item_response, status.HTTP_201_CREATED)
        menu_item_id = menu_item_response.data["id"]

        table_response = admin_client.post(
            "/api/admin/tables/",
            {"restaurant": restaurant_id, "number": 1},
            format="json",
        )
        self.assert_status(table_response, status.HTTP_201_CREATED)
        table_id = table_response.data["id"]
        qr_token = table_response.data["qr_token"]

        for username, role in (
            ("waiter", User.Role.WAITER),
            ("kitchen", User.Role.KITCHEN),
        ):
            response = admin_client.post(
                "/api/admin/users/",
                {
                    "username": username,
                    "password": f"{username}-password",
                    "role": role,
                },
                format="json",
            )
            self.assert_status(response, status.HTTP_201_CREATED)

        customer_client = APIClient()
        public_base = f"/api/public/qr/{qr_token}"
        session_response = customer_client.post(
            f"{public_base}/session/",
            {},
            format="json",
        )
        self.assert_status(session_response, status.HTTP_200_OK)
        self.assertIn("customer_session_key", customer_client.cookies)
        self.assertIsNone(session_response.data["table_session_id"])
        customer_session_id = session_response.data["customer_session_id"]
        table = RestaurantTable.objects.get(pk=table_id)
        self.assertEqual(table.status, RestaurantTable.Status.FREE)
        self.assertFalse(ActiveTableSession.objects.filter(table=table).exists())

        menu_response = customer_client.get(f"{public_base}/menu/")
        self.assert_status(menu_response, status.HTTP_200_OK)
        self.assertEqual(
            menu_response.data["categories"][0]["items"][0]["id"],
            menu_item_id,
        )

        cart_response = customer_client.post(
            f"{public_base}/cart/items/",
            {"menu_item": menu_item_id, "quantity": 2, "comment": "No onions"},
            format="json",
        )
        self.assert_status(cart_response, status.HTTP_201_CREATED)
        table.refresh_from_db()
        self.assertEqual(table.status, RestaurantTable.Status.FREE)
        self.assertFalse(ActiveTableSession.objects.filter(table=table).exists())

        order_response = customer_client.post(
            f"{public_base}/orders/",
            {},
            format="json",
        )
        self.assert_status(order_response, status.HTTP_201_CREATED)
        order_id = order_response.data["id"]
        self.assertEqual(order_response.data["status"], Order.Status.NEW)
        order = Order.objects.get(pk=order_id)
        table_session_id = order.table_session_id
        table.refresh_from_db()
        self.assertEqual(table.status, RestaurantTable.Status.OCCUPIED)
        self.assertEqual(
            ActiveTableSession.objects.filter(table=table).count(),
            1,
        )

        own_orders_response = customer_client.get(f"{public_base}/orders/")
        self.assert_status(own_orders_response, status.HTTP_200_OK)
        self.assertEqual(
            [item["id"] for item in own_orders_response.data["orders"]],
            [order_id],
        )

        kitchen_client = self.jwt_client("kitchen", "kitchen-password")
        kitchen_orders = kitchen_client.get("/api/kitchen/orders/")
        self.assert_status(kitchen_orders, status.HTTP_200_OK)
        self.assertIn(order_id, [item["id"] for item in kitchen_orders.data])

        preparing_response = kitchen_client.post(
            f"/api/kitchen/orders/{order_id}/preparing/",
            {},
            format="json",
        )
        self.assert_status(preparing_response, status.HTTP_200_OK)
        self.assertEqual(preparing_response.data["status"], Order.Status.PREPARING)

        ready_response = kitchen_client.post(
            f"/api/kitchen/orders/{order_id}/ready/",
            {},
            format="json",
        )
        self.assert_status(ready_response, status.HTTP_200_OK)
        self.assertEqual(ready_response.data["status"], Order.Status.READY)

        waiter_client = self.jwt_client("waiter", "waiter-password")
        shift_response = waiter_client.post(
            "/api/waiter/shifts/start/",
            {},
            format="json",
        )
        self.assert_status(shift_response, status.HTTP_200_OK)

        accept_response = waiter_client.post(
            f"/api/waiter/table-sessions/{table_session_id}/accept/",
            {},
            format="json",
        )
        self.assert_status(accept_response, status.HTTP_200_OK)

        waiter_orders = waiter_client.get("/api/waiter/orders/")
        self.assert_status(waiter_orders, status.HTTP_200_OK)
        self.assertIn(order_id, [item["id"] for item in waiter_orders.data])

        delivered_response = waiter_client.post(
            f"/api/waiter/orders/{order_id}/delivered/",
            {},
            format="json",
        )
        self.assert_status(delivered_response, status.HTTP_200_OK)
        self.assertEqual(delivered_response.data["status"], Order.Status.DELIVERED)

        close_response = waiter_client.post(
            f"/api/waiter/table-sessions/{table_session_id}/close/",
            {},
            format="json",
        )
        self.assert_status(close_response, status.HTTP_200_OK)

        order = Order.objects.get(pk=order_id)
        table = RestaurantTable.objects.get(pk=table_id)
        customer_session = CustomerSession.objects.get(pk=customer_session_id)
        self.assertEqual(order.status, Order.Status.COMPLETED)
        self.assertEqual(table.status, RestaurantTable.Status.FREE)
        self.assertFalse(customer_session.is_active)
        self.assertEqual(customer_session.table_id, table_id)
        self.assertFalse(
            CartItem.objects.filter(customer_session=customer_session).exists()
        )
