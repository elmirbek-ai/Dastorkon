from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase

from apps.notifications.routing import websocket_urlpatterns


User = get_user_model()


class NotificationWebsocketTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin", role=User.Role.ADMIN)
        self.waiter = User.objects.create_user("waiter", role=User.Role.WAITER)
        self.kitchen = User.objects.create_user("kitchen", role=User.Role.KITCHEN)
        self.application = URLRouter(websocket_urlpatterns)

    def communicator_for(self, user):
        communicator = WebsocketCommunicator(self.application, "/ws/notifications/")
        communicator.scope["user"] = user
        return communicator

    async def test_anonymous_websocket_connection_is_rejected(self):
        communicator = self.communicator_for(AnonymousUser())
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_authenticated_admin_can_connect(self):
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
