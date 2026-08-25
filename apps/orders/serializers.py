from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.menu.models import MenuItem
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, RestaurantTable

from .models import (
    ITEM_COMMENT_MAX_LENGTH,
    CartItem,
    Order,
    OrderItem,
    OrderStatusHistory,
    WaiterCall,
)


class CartItemSerializer(serializers.ModelSerializer):
    menu_item_name_ky = serializers.CharField(
        source="menu_item.name_ky",
        read_only=True,
    )
    menu_item_name_ru = serializers.CharField(
        source="menu_item.name_ru",
        read_only=True,
    )
    price = serializers.DecimalField(
        source="menu_item.price",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    is_available = serializers.BooleanField(
        source="menu_item.is_available",
        read_only=True,
    )
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = (
            "id",
            "menu_item",
            "menu_item_name_ky",
            "menu_item_name_ru",
            "price",
            "is_available",
            "quantity",
            "comment",
            "line_total",
        )

    @extend_schema_field(str)
    def get_line_total(self, obj):
        return f"{obj.menu_item.price * obj.quantity:.2f}"


class CartItemCreateSerializer(serializers.Serializer):
    menu_item = serializers.PrimaryKeyRelatedField(
        queryset=MenuItem.objects.all(),
    )
    quantity = serializers.IntegerField(default=1)
    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=ITEM_COMMENT_MAX_LENGTH,
        trim_whitespace=True,
    )


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(required=False)
    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=ITEM_COMMENT_MAX_LENGTH,
        trim_whitespace=True,
    )


class PublicOrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = (
            "id",
            "name_ky_at_order",
            "name_ru_at_order",
            "price_at_order",
            "quantity",
            "comment",
            "total_price",
        )


class PublicOrderSerializer(serializers.ModelSerializer):
    items = PublicOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "source",
            "status",
            "total_amount",
            "created_at",
            "items",
        )


class WaiterTableSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantTable
        fields = ("id", "number")


class WaiterRestaurantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Restaurant
        fields = ("id", "name")


class WaiterTableSessionSerializer(serializers.ModelSerializer):
    table = WaiterTableSerializer(read_only=True)
    restaurant = WaiterRestaurantSerializer(read_only=True)
    orders_count = serializers.IntegerField(read_only=True)
    total_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = ActiveTableSession
        fields = (
            "id",
            "table",
            "restaurant",
            "assigned_waiter",
            "status",
            "created_at",
            "orders_count",
            "total_amount",
        )
        read_only_fields = fields


class WaiterOrderSerializer(serializers.ModelSerializer):
    table_number = serializers.IntegerField(
        source="table_session.table.number",
        read_only=True,
    )
    items = PublicOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "table_session",
            "table_number",
            "source",
            "responsible_waiter",
            "status",
            "total_amount",
            "created_at",
            "items",
        )
        read_only_fields = fields


class KitchenOrderSerializer(WaiterOrderSerializer):
    pass


class ManualOrderTableSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    number = serializers.IntegerField(read_only=True)
    restaurant = serializers.IntegerField(read_only=True)
    restaurant_name = serializers.CharField(read_only=True)
    status = serializers.ChoiceField(
        choices=RestaurantTable.Status.choices,
        read_only=True,
    )
    active_session_id = serializers.IntegerField(read_only=True, allow_null=True)
    assigned_waiter = serializers.IntegerField(read_only=True, allow_null=True)
    assigned_waiter_username = serializers.CharField(
        read_only=True,
        allow_null=True,
    )
    is_assigned_to_current_waiter = serializers.BooleanField(read_only=True)
    can_use = serializers.BooleanField(read_only=True)
    unavailable_reason = serializers.CharField(read_only=True, allow_blank=True)


class ManualOrderMenuItemSerializer(serializers.ModelSerializer):
    category_name_ky = serializers.CharField(
        source="category.name_ky",
        read_only=True,
    )
    category_name_ru = serializers.CharField(
        source="category.name_ru",
        read_only=True,
    )

    class Meta:
        model = MenuItem
        fields = (
            "id",
            "category",
            "category_name_ky",
            "category_name_ru",
            "name_ky",
            "name_ru",
            "image",
            "price",
            "cooking_time_min",
            "is_hit",
            "is_new",
            "is_spicy",
            "is_vegetarian",
            "is_recommended",
            "is_available",
        )
        read_only_fields = fields


class ManualOrderMenuQuerySerializer(serializers.Serializer):
    table_id = serializers.IntegerField(min_value=1)


class ManualOrderItemCreateSerializer(serializers.Serializer):
    menu_item_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)
    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=ITEM_COMMENT_MAX_LENGTH,
        trim_whitespace=True,
    )


class ManualOrderCreateSerializer(serializers.Serializer):
    table_id = serializers.IntegerField(min_value=1)
    items = ManualOrderItemCreateSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        menu_item_ids = [item["menu_item_id"] for item in items]
        if len(menu_item_ids) != len(set(menu_item_ids)):
            raise serializers.ValidationError(
                "Each menu item can appear only once."
            )
        return items


class WaiterCallCreateSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=WaiterCall.Reason.choices)


class PublicWaiterCallSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaiterCall
        fields = (
            "id",
            "reason",
            "status",
            "table_session",
            "assigned_waiter",
            "created_at",
            "accepted_at",
            "completed_at",
        )
        read_only_fields = fields


class WaiterCallSerializer(PublicWaiterCallSerializer):
    table_number = serializers.IntegerField(
        source="table_session.table.number",
        read_only=True,
    )

    class Meta(PublicWaiterCallSerializer.Meta):
        fields = (
            "id",
            "reason",
            "status",
            "table_session",
            "table_number",
            "assigned_waiter",
            "created_at",
            "accepted_at",
            "completed_at",
        )
        read_only_fields = fields


class AdminOrderFilterSerializer(serializers.Serializer):
    restaurant = serializers.IntegerField(required=False)
    table = serializers.IntegerField(required=False)
    waiter = serializers.IntegerField(required=False)
    status = serializers.ChoiceField(
        choices=Order.Status.choices,
        required=False,
    )
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)


class AdminOrderListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(
        source="restaurant.name",
        read_only=True,
    )
    table = serializers.IntegerField(
        source="table_session.table_id",
        read_only=True,
    )
    table_number = serializers.IntegerField(
        source="table_session.table.number",
        read_only=True,
    )
    responsible_waiter_username = serializers.CharField(
        source="responsible_waiter.username",
        read_only=True,
        allow_null=True,
    )
    items_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "restaurant",
            "restaurant_name",
            "table_session",
            "table",
            "table_number",
            "customer_session",
            "source",
            "responsible_waiter",
            "responsible_waiter_username",
            "status",
            "total_amount",
            "created_at",
            "updated_at",
            "items_count",
        )
        read_only_fields = fields


class AdminOrderStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_username = serializers.CharField(
        source="changed_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = OrderStatusHistory
        fields = (
            "id",
            "from_status",
            "to_status",
            "changed_by",
            "changed_by_username",
            "created_at",
        )
        read_only_fields = fields


class AdminOrderDetailSerializer(AdminOrderListSerializer):
    items = PublicOrderItemSerializer(many=True, read_only=True)
    status_history = AdminOrderStatusHistorySerializer(many=True, read_only=True)

    class Meta(AdminOrderListSerializer.Meta):
        fields = tuple(
            field
            for field in AdminOrderListSerializer.Meta.fields
            if field != "items_count"
        ) + ("items", "status_history")
        read_only_fields = fields
