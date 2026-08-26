from rest_framework import serializers


class StatisticsFilterSerializer(serializers.Serializer):
    restaurant = serializers.IntegerField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    include_dashboard_comparison = serializers.BooleanField(
        required=False,
        default=False,
    )


class IntegerComparisonSerializer(serializers.Serializer):
    value = serializers.IntegerField()
    previous = serializers.IntegerField(allow_null=True)
    delta_percent = serializers.IntegerField(allow_null=True)
    trend = serializers.ChoiceField(
        choices=("up", "down", "neutral", "unavailable"),
    )


class ActiveTablesComparisonSerializer(IntegerComparisonSerializer):
    total = serializers.IntegerField()


class RevenueComparisonSerializer(serializers.Serializer):
    value = serializers.DecimalField(max_digits=14, decimal_places=2)
    previous = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        allow_null=True,
    )
    delta_percent = serializers.IntegerField(allow_null=True)
    trend = serializers.ChoiceField(
        choices=("up", "down", "neutral", "unavailable"),
    )


class DashboardKpisSerializer(serializers.Serializer):
    today_orders = IntegerComparisonSerializer()
    completed_orders = IntegerComparisonSerializer()
    active_tables = ActiveTablesComparisonSerializer()
    today_revenue = RevenueComparisonSerializer()


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
    dashboard_kpis = DashboardKpisSerializer(required=False)
