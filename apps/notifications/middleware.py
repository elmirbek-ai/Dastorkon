from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


@database_sync_to_async
def get_user_from_access_token(raw_token):
    if not raw_token:
        return AnonymousUser()

    authentication = JWTAuthentication()
    try:
        validated_token = authentication.get_validated_token(raw_token)
        return authentication.get_user(validated_token)
    except (AuthenticationFailed, InvalidToken, TokenError):
        return AnonymousUser()


class JWTAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scoped_request = dict(scope)
        try:
            query_params = parse_qs(
                scoped_request.get("query_string", b"").decode("utf-8")
            )
            raw_token = query_params.get("token", [None])[0]
        except (UnicodeDecodeError, ValueError):
            raw_token = None

        scoped_request["user"] = await get_user_from_access_token(raw_token)
        return await self.inner(scoped_request, receive, send)


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(inner)
