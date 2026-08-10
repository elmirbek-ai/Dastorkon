from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminRole

from .serializers import StatisticsFilterSerializer, StatisticsSummarySerializer
from .services import get_statistics_summary


class StatisticsSummaryView(APIView):
    permission_classes = (IsAdminRole,)

    @extend_schema(
        parameters=[StatisticsFilterSerializer],
        responses=StatisticsSummarySerializer,
    )
    def get(self, request):
        filter_serializer = StatisticsFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)
        summary = get_statistics_summary(filter_serializer.validated_data)
        return Response(StatisticsSummarySerializer(summary).data)
