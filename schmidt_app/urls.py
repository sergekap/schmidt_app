from django.urls import path
from . import views

urlpatterns = [
    # Pages
    path("", views.index, name="index"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("first-login/", views.force_change_password, name="force_change_password"),

    # API Groupes
    path("api/groups/", views.groups_list, name="groups_list"),
    path("api/groups/<slug:slug>/", views.group_detail, name="group_detail"),
    path("api/groups/<slug:slug>/colors/", views.group_colors_create, name="group_colors_create"),
    path("api/groups/<slug:slug>/colors/reorder", views.group_colors_reorder, name="group_colors_reorder"),

    # API Couleurs
    path("api/colors/", views.colors_list, name="colors_list"),
    path("api/colors/<int:color_id>/", views.color_detail, name="color_detail"),
    path("api/colors/<int:color_id>/images/", views.color_images, name="color_images"),
    path("api/colors/<int:color_id>/images/<int:image_id>/", views.color_image_detail, name="color_image_detail"),

    # Auth
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("password-reset/", views.forgot_password, name="forgot_password"),
    path("reset/<uidb64>/<token>/", views.reset_password_confirm, name="password_reset_confirm"),

    # API Utilisateurs
    path("api/users/", views.users_list_create, name="users_list_create"),
    path("api/users/<int:user_id>/", views.user_detail, name="user_detail"),

    # Performance API
    path("api/perf/session-start/", views.perf_session_start, name="perf_session_start"),
    path("api/perf/session-stop/", views.perf_session_stop, name="perf_session_stop"),
    path("api/perf/track/", views.perf_track, name="perf_track"),
    path("api/perf/stats/", views.perf_stats, name="perf_stats"),
    path("api/perf/breakdown/<str:section>/", views.perf_breakdown, name="perf_breakdown"),

]
