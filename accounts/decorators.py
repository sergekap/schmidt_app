from functools import wraps
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied

def role_required(*roles):
    def decorator(view):
        @login_required
        @wraps(view)
        def _wrapped(request, *args, **kwargs):
            if getattr(request.user, "role", None) in roles:
                return view(request, *args, **kwargs)
            raise PermissionDenied  # 403
        return _wrapped
    return decorator

admin_required   = role_required("ADMIN")
manager_or_admin = role_required("ADMIN", "MANAGER")
