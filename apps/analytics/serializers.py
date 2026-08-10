from rest_framework import serializers


class StatisticsFilterSerializer(serializers.Serializer):
    restaurant = serializers.IntegerField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)


class PopularItemSerializer(serializers.Serializer):
    name_ky_at_order = serializers.CharField()
    name_ru_at_order = serializers.CharField()
    total_quantity = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2)


class TableStatsSerializer(serializers.Serializer):
    table = serializers.IntegerField()
    table_number = serializers.IntegerField()
    orders_count = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2)


class WaiterStatsSerializer(serializers.Serializer):
    waiter = serializers.IntegerField(allow_null=True)
    waiter_username = serializers.CharField(allow_null=True)
    orders_count = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2)


class StatisticsSummarySerializer(serializers.Serializer):
    total_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    completed_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    average_order_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
    )
    active_table_sessions = serializers.IntegerField()
    orders_by_status = serializers.DictField(
        child=serializers.IntegerField(),
    )
    popular_items = PopularItemSerializer(many=True)
    table_stats = TableStatsSerializer(many=True)
    waiter_stats = WaiterStatsSerializer(many=True)
