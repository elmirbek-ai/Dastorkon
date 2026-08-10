from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close()
            return

        self.notification_groups = [f"user_{user.pk}"]
        role_group = {
            "ADMIN": "admins",
            "WAITER": "waiters",
            "KITCHEN": "kitchen",
        }.get(user.role)
        if role_group:
            self.notification_groups.append(role_group)

        for group in self.notification_groups:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        for group in getattr(self, "notification_groups", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def notification_message(self, event):
        await self.send_json(
            {
                "type": event["type"],
                "event": event.get("event"),
                "data": event.get("data", {}),
            }
        )
