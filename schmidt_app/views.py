import json
from typing import List

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.password_validation import validate_password, ValidationError
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import EmailMessage
from django.db.models import Prefetch
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.crypto import get_random_string
from django.utils.encoding import force_str, force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods

from accounts.models import Role
from .models import ColorGroup, Color, ColorImage, Section


# ---------------------------
# Helpers généraux
# ---------------------------

def _get_section(request):
    s = (request.GET.get('section') or request.POST.get('section') or '').strip().lower()
    return s if s in dict(Section.choices) else Section.FACADES


def _json_payload(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return {}


def _next_position(qs, field="position"):
    last = qs.order_by(f"-{field}").values_list(field, flat=True).first()
    return (last or 0) + 1


# ---------- helpers d’autorisation ----------
def is_admin_or_manager(user):
    """Autorise ADMIN et MANAGER."""
    role = getattr(user, "role", None)
    return user.is_authenticated and role in (
        getattr(Role, "ADMIN", "ADMIN"),
        getattr(Role, "MANAGER", "MANAGER"),
    )


def role_required(*allowed_roles):
    """Décorateur pour protéger une vue par rôle."""
    def _predicate(u):
        return u.is_authenticated and getattr(u, "role", None) in allowed_roles
    return user_passes_test(_predicate, login_url="login")


# ---------------------------
# Pages HTML
# ---------------------------

def index(request):
    # Préfetch images + ordre pour éviter N+1
    colors_qs = (
        Color.objects.order_by("position", "name")
        .prefetch_related(Prefetch("images", queryset=ColorImage.objects.order_by("position", "id")))
    )
    ctx = {}
    for code, label in Section.choices:
        groups = (
            ColorGroup.objects
            .filter(section=code)
            .order_by("position", "name")
            .prefetch_related(Prefetch("colors", queryset=colors_qs))
        )
        ctx[f"groups_{code}"] = groups
        ctx[f"label_{code}"] = label

    return render(request, "index.html", ctx)


# ---------------------------
# Auth
# ---------------------------

def login_view(request):
    """
    Login email + mot de passe.
    Redirige vers force_change_password si must_change_password=True.
    """
    if request.method == "POST":
        email = (request.POST.get("email") or "").strip().lower()
        password = request.POST.get("password") or ""
        user = authenticate(request, email=email, password=password)  # USERNAME_FIELD=email

        if user is not None:
            login(request, user)
            if getattr(user, "must_change_password", False):
                messages.info(request, "Définissez un nouveau mot de passe pour continuer.")
                return redirect("force_change_password")
            next_url = request.GET.get("next") or reverse("dashboard")
            return redirect(next_url)

        messages.error(request, "Identifiants invalides.")

    return render(request, "login.html")


@login_required
def logout_view(request):
    logout(request)
    messages.info(request, "Vous avez été déconnecté.")
    return redirect("login")


@login_required
def force_change_password(request):
    """
    Première connexion : oblige à définir un nouveau mot de passe.
    """
    u = request.user
    if not getattr(u, "must_change_password", False):
        return redirect("dashboard")

    if request.method == "POST":
        p1 = request.POST.get("password1") or ""
        p2 = request.POST.get("password2") or ""
        if p1 != p2:
            messages.error(request, "Les mots de passe ne correspondent pas.")
        else:
            try:
                validate_password(p1, user=u)
            except ValidationError as e:
                messages.error(request, " ".join(e.messages))
            else:
                u.set_password(p1)
                u.must_change_password = False
                u.save(update_fields=["password", "must_change_password"])
                messages.success(request, "Mot de passe mis à jour.")
                # Re-authentifier l'utilisateur
                user = authenticate(request, email=u.email, password=p1)
                if user:
                    login(request, user)
                return redirect("dashboard")

    return render(request, "reset_password_confirm.html")


@user_passes_test(is_admin_or_manager, login_url="login")
def dashboard(request):
    """
    Tableau de bord — réservé ADMIN/MANAGER.
    """
    if getattr(request.user, "must_change_password", False):
        return redirect("force_change_password")
    return render(request, "dashboard.html")


def forgot_password(request):
    """
    Envoi d’un email avec lien de réinitialisation.
    """
    if request.method == "POST":
        email = (request.POST.get("email") or "").strip().lower()
        User = get_user_model()

        try:
            user = User.objects.get(email__iexact=email, is_active=True)
        except User.DoesNotExist:
            messages.success(request, "Si un compte est associé à cet email, un lien vient d'être envoyé.")
            return redirect("login")

        token_gen = PasswordResetTokenGenerator()
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = token_gen.make_token(user)

        reset_url = request.build_absolute_uri(
            reverse("password_reset_confirm", args=[uidb64, token])
        )

        subject = "Réinitialisation de votre mot de passe"
        ctx = {"user": user, "reset_url": reset_url, "site_name": "Schmidt"}
        html_body = render_to_string("emails/password_reset.html", ctx)

        msg = EmailMessage(
            subject=subject,
            body=html_body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            to=[email],
        )
        msg.content_subtype = "html"
        msg.send(fail_silently=False)

        messages.success(request, "Si un compte est associé à cet email, un lien vient d'être envoyé.")
        return redirect("login")

    return render(request, "forgot_password.html")


def reset_password_confirm(request, uidb64, token):
    """
    Formulaire pour définir un nouveau mot de passe depuis l’email.
    """
    User = get_user_model()
    token_gen = PasswordResetTokenGenerator()

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid, is_active=True)
    except Exception:
        user = None

    if user is None or not token_gen.check_token(user, token):
        messages.error(request, "Lien de réinitialisation invalide ou expiré.")
        return redirect("login")

    if request.method == "POST":
        p1 = request.POST.get("password1") or ""
        p2 = request.POST.get("password2") or ""
        if len(p1) < 8:
            messages.error(request, "Le mot de passe doit contenir au moins 8 caractères.")
        elif p1 != p2:
            messages.error(request, "Les mots de passe ne correspondent pas.")
        else:
            user.set_password(p1)
            user.save(update_fields=["password"])
            messages.success(request, "Mot de passe modifié. Vous pouvez vous connecter.")
            return redirect("login")

    return render(request, "reset_password_confirm.html", {"uidb64": uidb64, "token": token})


# ---------------------------
# API UTILISATEURS (ADMIN)
# ---------------------------

def _user_dict(u):
    return {
        "id": u.id,
        "email": u.email,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "role": u.role,
        "is_active": u.is_active,
    }


@require_http_methods(["GET", "POST"])
@csrf_protect
@role_required(getattr(Role, "ADMIN", "ADMIN"))
def users_list_create(request):
    """
    GET  -> liste des utilisateurs
    POST -> crée un utilisateur avec mdp temporaire et must_change_password=True
    """
    User = get_user_model()

    if request.method == "GET":
        users = User.objects.order_by("last_name", "first_name").all()
        return JsonResponse({"results": [_user_dict(u) for u in users]})

    data = request.POST or _json_payload(request)
    email = (data.get("email") or "").strip().lower()
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    role = data.get("role") or getattr(Role, "MANAGER", "MANAGER")

    if not email:
        return JsonResponse({"error": "email is required"}, status=400)

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({"error": "Un utilisateur avec cet email existe déjà"}, status=400)

    temp_password = get_random_string(12)

    user = User.objects.create(
        username=email.split("@")[0],
        email=email,
        first_name=first_name,
        last_name=last_name,
        role=role,
        is_active=True,
        must_change_password=True,
    )
    user.set_password(temp_password)
    user.save()

    # Email de bienvenue + mdp temporaire
    login_url = request.build_absolute_uri(reverse("login"))
    ctx = {
        "user": user,
        "login_url": login_url,
        "temp_password": temp_password,
        "site_name": "Schmidt",
    }
    html_body = render_to_string("emails/new_user_welcome.html", ctx)
    msg = EmailMessage(
        subject="Votre accès à la plateforme Schmidt",
        body=html_body,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        to=[email],
    )
    msg.content_subtype = "html"
    msg.send(fail_silently=False)

    return JsonResponse(_user_dict(user), status=201)


@require_http_methods(["PATCH", "DELETE"])
@csrf_protect
@role_required(getattr(Role, "ADMIN", "ADMIN"))
def user_detail(request, user_id: int):
    """
    PATCH -> modifie first_name/last_name/role (+ reset_password)
    DELETE -> supprime l’utilisateur
    """
    User = get_user_model()
    u = get_object_or_404(User, pk=user_id)

    if request.method == "DELETE":
        u.delete()
        return JsonResponse({}, status=204)

    data = _json_payload(request)
    changed = False

    if "first_name" in data:
        u.first_name = data["first_name"]; changed = True
    if "last_name" in data:
        u.last_name = data["last_name"]; changed = True

    if "role" in data:
        new_role = data["role"]
        # empêcher de retirer le DERNIER admin
        if u.role == getattr(Role, "ADMIN", "ADMIN") and new_role == getattr(Role, "MANAGER", "MANAGER"):
            other_admins = User.objects.filter(role=getattr(Role, "ADMIN", "ADMIN")).exclude(pk=u.pk).count()
            if other_admins == 0:
                return JsonResponse({"error": "Impossible de retirer le dernier administrateur."}, status=400)
        u.role = new_role
        changed = True

    if data.get("reset_password"):
        temp_password = get_random_string(12)
        u.set_password(temp_password)
        u.must_change_password = True
        changed = True
        login_url = request.build_absolute_uri(reverse("login"))
        ctx = {"user": u, "login_url": login_url, "temp_password": temp_password, "site_name": "Schmidt"}
        html_body = render_to_string("emails/new_user_welcome.html", ctx)
        msg = EmailMessage(
            subject="Votre mot de passe a été réinitialisé",
            body=html_body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            to=[u.email],
        )
        msg.content_subtype = "html"
        msg.send(fail_silently=False)

    if changed:
        u.save()
    return JsonResponse(_user_dict(u))


# ---------------------------
# API Groupes
# ---------------------------

@require_http_methods(["GET", "POST"])
@csrf_protect
def groups_list(request):
    """
    GET  -> liste des groupes de la section (?section=facades|plans|espaces|ambiances)
    POST -> crée un groupe {name, section?}
    """
    if request.method == "GET":
        section = _get_section(request)
        groups = ColorGroup.objects.filter(section=section).order_by("position", "name")
        data = [_group_dict(request, g) for g in groups]
        return JsonResponse({"results": data})

    # POST
    payload = _json_payload(request)
    name = (payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "name is required"}, status=400)

    section = payload.get("section") or _get_section(request)
    group = ColorGroup.objects.create(
        name=name,
        section=section,
        position=_next_position(ColorGroup.objects.filter(section=section)),
    )
    return JsonResponse(_group_dict(request, group), status=201)


@require_http_methods(["PATCH", "DELETE"])
@csrf_protect
def group_detail(request, slug):
    """
    PATCH /api/groups/<slug>/ -> { "name"?, "position"? }
    DELETE /api/groups/<slug>/
    """
    group = get_object_or_404(ColorGroup, slug=slug)

    if request.method == "PATCH":
        payload = _json_payload(request)
        changed = False
        if "name" in payload and payload["name"]:
            group.name = payload["name"]; changed = True
        if "position" in payload and isinstance(payload["position"], int):
            group.position = payload["position"]; changed = True
        if changed:
            group.save()
        return JsonResponse(_group_dict(request, group))

    group.delete()
    return JsonResponse({}, status=204)


@require_http_methods(["POST"])
@csrf_protect
def group_colors_create(request, slug):
    """
    POST /api/groups/<slug>/colors/
    Body: { "name": "Avocado" }
    -> crée une couleur dans le groupe
    """
    group = get_object_or_404(ColorGroup, slug=slug)
    payload = _json_payload(request)
    name = (payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "name is required"}, status=400)

    color = Color.objects.create(
        group=group,
        name=name,
        position=_next_position(group.colors.all())
    )
    return JsonResponse(_color_dict(request, color), status=201)


@require_http_methods(["PATCH"])
@csrf_protect
def group_colors_reorder(request, slug):
    """
    PATCH /api/groups/<slug>/colors/reorder
    Body: { "order": [<color_id>, ...] }  -> réordonne les chips d'un groupe
    """
    group = get_object_or_404(ColorGroup, slug=slug)
    payload = _json_payload(request)
    order: List[int] = payload.get("order") or []
    if not isinstance(order, list) or not all(isinstance(i, int) for i in order):
        return JsonResponse({"error": "order must be a list of integers"}, status=400)

    # vérifie appartenance
    colors = {c.id: c for c in group.colors.filter(id__in=order)}
    if len(colors) != len(order):
        return JsonResponse({"error": "some color ids do not belong to this group"}, status=400)

    for pos, cid in enumerate(order):
        Color.objects.filter(id=cid).update(position=pos)

    return JsonResponse({"ok": True})


# ---------------------------
# API Couleurs (PAR ID)
# ---------------------------

@require_http_methods(["GET"])
def colors_list(request):
    """
    GET /api/colors/ -> liste de toutes les couleurs (à plat)
    """
    colors = Color.objects.select_related("group").all().order_by("group__position", "position", "name")
    return JsonResponse({"results": [_color_dict(request, c) for c in colors]})


@require_http_methods(["PATCH", "DELETE"])
@csrf_protect
def color_detail(request, color_id: int):
    """
    PATCH /api/colors/<id>/ -> { "name"?, "position"?, "group_slug"? }
    DELETE /api/colors/<id>/
    """
    color = get_object_or_404(Color, pk=color_id)

    if request.method == "PATCH":
        payload = _json_payload(request)
        fields = []

        if "name" in payload and payload["name"]:
            color.name = payload["name"]; fields.append("name")

        if "position" in payload and isinstance(payload["position"], int):
            color.position = payload["position"]; fields.append("position")

        if "group_slug" in payload:
            if payload["group_slug"] is None:
                color.group = None; fields.append("group")
            else:
                group = get_object_or_404(ColorGroup, slug=payload["group_slug"])
                color.group = group; fields.append("group")

        if fields:
            color.save(update_fields=fields)
        return JsonResponse(_color_dict(request, color))

    # DELETE
    color.delete()
    return JsonResponse({}, status=204)


# ---------------------------
# API Images d'une couleur (PAR ID)
# ---------------------------

@require_http_methods(["GET", "POST", "PATCH"])
@csrf_protect
def color_images(request, color_id: int):
    """
    GET  /api/colors/<id>/images/
    POST /api/colors/<id>/images/ (multipart):
         - files=[...] (ou file=...)
         - is_presentation=true|false
    PATCH /api/colors/<id>/images/ :
         { "order":[ids...] }  OU  { "presentation_id": id }
    """
    color = get_object_or_404(Color, pk=color_id)

    if request.method == "GET":
        pres = color.presentation
        gallery = color.images.filter(is_presentation=False).order_by("position", "id")
        return JsonResponse({
            "color": _color_dict(request, color, with_presentation=False),
            "presentation": _image_dict(request, pres) if pres else None,
            "gallery": [_image_dict(request, g) for g in gallery],
        })

    if request.method == "POST":
        is_presentation = (request.POST.get("is_presentation") == "true")
        files = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not files:
            return JsonResponse({"error": "no file provided"}, status=400)

        created = []
        start_pos = color.images.filter(is_presentation=False).count()
        for i, f in enumerate(files):
            img = ColorImage.objects.create(
                color=color,
                image=f,
                is_presentation=is_presentation and i == 0,
                position=0 if is_presentation else (start_pos + i),
            )
            created.append(_image_dict(request, img))
        return JsonResponse({"created": created}, status=201)

    # PATCH (order or presentation_id)
    payload = _json_payload(request)
    if "order" in payload:
        order: List[int] = payload["order"]
        if not isinstance(order, list) or not all(isinstance(i, int) for i in order):
            return JsonResponse({"error": "order must be a list of integers"}, status=400)

        imgs = {i.id: i for i in color.images.filter(is_presentation=False, id__in=order)}
        if len(imgs) != len(order):
            return JsonResponse({"error": "some image ids do not belong to this color's gallery"}, status=400)

        for pos, iid in enumerate(order):
            ColorImage.objects.filter(id=iid).update(position=pos)

        return JsonResponse({"ok": True})

    if "presentation_id" in payload:
        img = get_object_or_404(ColorImage, color=color, pk=payload["presentation_id"])
        img.is_presentation = True
        img.save()  # le modèle garantit l’unicité applicative
        return JsonResponse({"ok": True})

    return JsonResponse({"error": "Nothing to update."}, status=400)


@require_http_methods(["PATCH", "DELETE"])
@csrf_protect
def color_image_detail(request, color_id: int, image_id: int):
    """
    PATCH /api/colors/<id>/images/<image_id>/
    DELETE /api/colors/<id>/images/<image_id>/
    """
    color = get_object_or_404(Color, pk=color_id)
    img = get_object_or_404(ColorImage, color=color, pk=image_id)

    if request.method == "DELETE":
        img.delete()
        return JsonResponse({}, status=204)

    payload = _json_payload(request)
    fields = []
    if "alt" in payload:
        img.alt = payload["alt"] or ""; fields.append("alt")
    if "is_presentation" in payload:
        img.is_presentation = bool(payload["is_presentation"]); fields.append("is_presentation")
    if fields:
        img.save(update_fields=fields)
        return JsonResponse(_image_dict(request, img))
    return JsonResponse({"error": "No changes"}, status=400)


# ---------------------------
# Serializers utilitaires
# ---------------------------

def _image_dict(request, img: ColorImage):
    return {
        "id": img.id,
        "url": request.build_absolute_uri(img.image.url),
        "is_presentation": img.is_presentation,
        "position": img.position,
        "alt": img.alt or "",
    }


def _color_dict(request, color: Color, with_presentation=True):
    d = {
        "id": color.id,
        "name": color.name,
        "slug": color.slug,  # utile côté UI/affichage
        "position": color.position,
        "group_slug": color.group.slug if color.group else None,
    }
    if with_presentation:
        pres = color.presentation
        d["presentation"] = _image_dict(request, pres) if pres else None
        d["gallery_count"] = color.images.filter(is_presentation=False).count()
    return d


def _group_dict(request, group: ColorGroup, with_colors=True):
    d = {
        "id": group.id,
        "name": group.name,
        "slug": group.slug,
        "position": group.position,
        "section": getattr(group, "section", None),
    }
    if with_colors:
        colors = group.colors.order_by("position", "name").all()
        d["colors"] = [_color_dict(request, c) for c in colors]
    return d
