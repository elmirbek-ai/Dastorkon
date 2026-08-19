from datetime import timedelta

from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.notifications.middleware import JWTAuthMiddlewareStack
from apps.notifications.routing import websocket_urlpatterns


User = get_user_model()


class NotificationWebsocketTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin", role=User.Role.ADMIN)
        self.waiter = User.objects.create_user("waiter", role=User.Role.WAITER)
        self.kitchen = User.objects.create_user("kitchen", role=User.Role.KITCHEN)
        self.application = JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns))

    def communicator_for(self, user=None, token=None):
        access_token = token
        if user is not None and access_token is None:
            access_token = str(AccessToken.for_user(user))
        query = f"?token={access_token}" if access_token else ""
        return WebsocketCommunicator(
            self.application,
            f"/ws/notifications/{query}",
        )

    async def test_anonymous_websocket_connection_is_rejected(self):
        communicator = self.communicator_for()
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_invalid_jwt_websocket_connection_is_rejected(self):
        communicator = self.communicator_for(token="not-a-valid-access-token")
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_expired_jwt_websocket_connection_is_rejected(self):
        token = AccessToken.for_user(self.kitchen)
        token.set_exp(from_time=timezone.now(), lifetime=timedelta(seconds=-1))
        communicator = self.communicator_for(token=str(token))
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_valid_jwt_websocket_connection_is_accepted(self):
        communicator = self.communicator_for(self.admin)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_authenticated_waiter_can_connect(self):
        communicator = self.communicator_for(self.waiter)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_authenticated_kitchen_can_connect(self):
        communicator = self.communicator_for(self.kitchen)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_authenticated_user_receives_personal_group_message(self):
        await self.assert_group_message(self.admin, f"user_{self.admin.pk}")

    async def test_waiter_receives_waiters_group_message(self):
        await self.assert_group_message(self.waiter, "waiters")

    async def test_kitchen_receives_kitchen_group_message(self):
        await self.assert_group_message(self.kitchen, "kitchen")

    async def test_admin_receives_admins_group_message(self):
        await self.assert_group_message(self.admin, "admins")

    async def assert_group_message(self, user, group):
        communicator = self.communicator_for(user)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        event = {
            "type": "notification.message",
            "event": "test_event",
            "data": {"value": 1},
        }
        await get_channel_layer().group_send(group, event)

        self.assertEqual(await communicator.receive_json_from(), event)
        await communicator.disconnect()
