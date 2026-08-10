from rest_framework import serializers

from apps.menu.models import MenuItem

from .models import CartItem, Order, OrderItem


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
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = (
            "id",
            "menu_item",
            "menu_item_name_ky",
            "menu_item_name_ru",
            "price",
            "quantity",
            "comment",
            "line_total",
        )

    def get_line_total(self, obj):
        return f"{obj.menu_item.price * obj.quantity:.2f}"


class CartItemCreateSerializer(serializers.Serializer):
    menu_item = serializers.PrimaryKeyRelatedField(
        queryset=MenuItem.objects.all(),
    )
    quantity = serializers.IntegerField(default=1)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(required=False)
    comment = serializers.CharField(required=False, allow_blank=True)


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
            "status",
            "total_amount",
            "created_at",
            "items",
        )
