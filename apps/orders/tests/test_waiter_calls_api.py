import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import WaiterCall
from apps.orders.services import (
    accept_waiter_call,
    assign_waiter_to_table_session,
    create_waiter_call,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)
from apps.users.models import User, WaiterShift


class WaiterCallApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            role=User.Role.ADMIN,
        )
        self.waiter = User.objects.create_user(
            username="waiter",
            role=User.Role.WAITER,
        )
        self.other_waiter = User.objects.create_user(
            username="other-waiter",
            role=User.Role.WAITER,
        )
        self.off_shift_waiter = User.objects.create_user(
            username="off-shift",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="kitchen",
            role=User.Role.KITCHEN,
        )
        WaiterShift.objects.create(waiter=self.waiter)
        WaiterShift.objects.create(waiter=self.other_waiter)

        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.table_session = get_or_create_active_table_session(self.table)
        self.customer_session = create_customer_session(self.table_session)
        self.client.cookies["customer_session_key"] = str(
            self.customer_session.session_key
        )
        self.public_url = reverse(
            "public-waiter-call-create",
            args=(self.table.qr_token,),
        )
        self.calls_url = reverse("waiter-calls")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def accept_url(self, waiter_call):
        return reverse("waiter-call-accept", args=(waiter_call.pk,))

    def complete_url(self, waiter_call):
        return reverse("waiter-call-complete", args=(waiter_call.pk,))

    def test_public_endpoint_works_without_jwt_with_customer_cookie(self):
        response = self.client.post(
            self.public_url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_public_call_activates_free_table_without_existing_session(self):
        table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=2,
        )
        customer_session = create_customer_session(table=table)
        self.client.cookies["customer_session_key"] = str(
            customer_session.session_key
        )
        url = reverse("public-waiter-call-create", args=(table.qr_token,))

        response = self.client.post(
            url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        table.refresh_from_db()
        customer_session.refresh_from_db()
        waiter_call = WaiterCall.objects.get(pk=response.data["id"])
        self.assertEqual(table.status, RestaurantTable.Status.OCCUPIED)
        self.assertEqual(
            customer_session.active_table_session_id,
            waiter_call.table_session_id,
        )
        self.assertEqual(
            ActiveTableSession.objects.filter(table=table).count(),
            1,
        )

    def test_public_endpoint_rejects_missing_cookie(self):
        del self.client.cookies["customer_session_key"]

        response = self.client.post(
            self.public_url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_endpoint_rejects_invalid_cookie(self):
        self.client.cookies["customer_session_key"] = str(uuid.uuid4())

        response = self.client.post(
            self.public_url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_endpoint_rejects_cookie_from_another_table_session(self):
        other_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=2,
        )
        other_session = get_or_create_active_table_session(other_table)
        other_customer = create_customer_session(other_session)
        self.client.cookies["customer_session_key"] = str(
            other_customer.session_key
        )

        response = self.client.post(
            self.public_url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_can_create_waiter_needed_call(self):
        response = self.client.post(
            self.public_url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        waiter_call = WaiterCall.objects.get(pk=response.data["id"])
        self.assertEqual(waiter_call.reason, WaiterCall.Reason.WAITER_NEEDED)
        self.assertEqual(waiter_call.status, WaiterCall.Status.NEW)

    def test_customer_can_create_bill_request_call(self):
        response = self.client.post(
            self.public_url,
            {"reason": WaiterCall.Reason.BILL_REQUEST},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["reason"], WaiterCall.Reason.BILL_REQUEST)

    def test_invalid_reason_is_rejected(self):
        response = self.client.post(
            self.public_url,
            {"reason": "INVALID"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_call_is_assigned_to_table_waiter(self):
        self.table_session = assign_waiter_to_table_session(
            self.table_session,
            self.waiter,
        )

        response = self.client.post(
            self.public_url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        self.assertEqual(response.data["assigned_waiter"], self.waiter.pk)

    def test_call_is_unassigned_when_table_has_no_waiter(self):
        response = self.client.post(
            self.public_url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        self.assertIsNone(response.data["assigned_waiter"])

    def test_anonymous_user_cannot_access_waiter_call_list(self):
        del self.client.cookies["customer_session_key"]

        response = self.client.get(self.calls_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_cannot_access_waiter_call_list(self):
        self.authenticate(self.admin)

        response = self.client.get(self.calls_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_cannot_access_waiter_call_list(self):
        self.authenticate(self.kitchen)

        response = self.client.get(self.calls_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_waiter_without_shift_cannot_access_waiter_call_list(self):
        self.authenticate(self.off_shift_waiter)

        response = self.client.get(self.calls_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_waiter_can_list_unassigned_calls(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )

        response = self.client.get(self.calls_url)

        self.assertIn(waiter_call.pk, [item["id"] for item in response.data])

    def test_waiter_can_list_calls_assigned_to_himself(self):
        self.authenticate(self.waiter)
        self.table_session = assign_waiter_to_table_session(
            self.table_session,
            self.waiter,
        )
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )

        response = self.client.get(self.calls_url)

        self.assertIn(waiter_call.pk, [item["id"] for item in response.data])

    def test_waiter_cannot_list_calls_assigned_to_another_waiter(self):
        self.authenticate(self.waiter)
        self.table_session = assign_waiter_to_table_session(
            self.table_session,
            self.other_waiter,
        )
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )

        response = self.client.get(self.calls_url)

        self.assertNotIn(waiter_call.pk, [item["id"] for item in response.data])

    def test_waiter_can_accept_unassigned_call(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )

        response = self.client.post(self.accept_url(waiter_call))

        waiter_call.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(waiter_call.status, WaiterCall.Status.ACCEPTED)
        self.assertEqual(waiter_call.assigned_waiter, self.waiter)

    def test_accepting_unassigned_call_assigns_table_session(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )

        self.client.post(self.accept_url(waiter_call))

        self.table_session.refresh_from_db()
        self.assertEqual(self.table_session.assigned_waiter, self.waiter)

    def test_same_waiter_accepting_call_twice_is_idempotent(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )
        first_response = self.client.post(self.accept_url(waiter_call))

        second_response = self.client.post(self.accept_url(waiter_call))

        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.data["id"], first_response.data["id"])
        self.assertEqual(
            second_response.data["accepted_at"],
            first_response.data["accepted_at"],
        )

    def test_another_waiter_cannot_accept_assigned_call(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )
        self.client.post(self.accept_url(waiter_call))
        self.authenticate(self.other_waiter)

        response = self.client.post(self.accept_url(waiter_call))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_waiter_can_complete_accepted_call(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )
        accept_waiter_call(waiter_call, self.waiter)

        response = self.client.post(self.complete_url(waiter_call))

        waiter_call.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(waiter_call.status, WaiterCall.Status.DONE)

    def test_completing_call_sets_completed_at(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )
        accept_waiter_call(waiter_call, self.waiter)

        self.client.post(self.complete_url(waiter_call))

        waiter_call.refresh_from_db()
        self.assertIsNotNone(waiter_call.completed_at)

    def test_waiter_cannot_complete_another_waiters_call(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )
        accept_waiter_call(waiter_call, self.other_waiter)

        response = self.client.post(self.complete_url(waiter_call))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_waiter_cannot_complete_new_call(self):
        self.authenticate(self.waiter)
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.WAITER_NEEDED,
        )

        response = self.client.post(self.complete_url(waiter_call))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
