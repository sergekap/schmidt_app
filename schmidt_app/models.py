# schmidt_app/models.py
from django.db import models
from django.db.models import UniqueConstraint
from django.db.models.functions import Lower
from django.utils.text import slugify
from django.core.files.storage import default_storage


class Section(models.TextChoices):
    FACADES = 'facades', 'Façades'
    PLANS = 'plans', 'Plans de travail'
    ESPACES = 'espaces', 'Espaces de la maison'
    AMBIANCES = 'ambiances', 'Ambiances'


# ---------- Utils ----------
def _uniqueify_slug_for_group(base_slug: str, group: "ColorGroup", instance_pk=None) -> str:
    """
    Retourne un slug unique dans le groupe donné en évitant les collisions
    avec Color(slug) existants du même group.
    """
    slug = base_slug or "item"
    Model = Color
    qs = Model.objects.filter(group=group, slug=slug)
    if instance_pk:
        qs = qs.exclude(pk=instance_pk)
    if not qs.exists():
        return slug

    i = 2
    while True:
        candidate = f"{slug}-{i}"
        qs = Model.objects.filter(group=group, slug=candidate)
        if instance_pk:
            qs = qs.exclude(pk=instance_pk)
        if not qs.exists():
            return candidate
        i += 1


def _uniqueify_slug_for_group_model(base_slug: str, section_slug_model: "ColorGroup", instance_pk=None) -> str:
    """
    Pour ColorGroup : unique global (champ slug unique=True).
    Suffixe en cas de collision globale.
    """
    slug = base_slug or "groupe"
    Model = ColorGroup
    qs = Model.objects.filter(slug=slug)
    if instance_pk:
        qs = qs.exclude(pk=instance_pk)
    if not qs.exists():
        return slug

    i = 2
    while True:
        candidate = f"{slug}-{i}"
        qs = Model.objects.filter(slug=candidate)
        if instance_pk:
            qs = qs.exclude(pk=instance_pk)
        if not qs.exists():
            return candidate
        i += 1


# ---------- Modèles ----------
class ColorGroup(models.Model):
    # nom NON unique pour permettre des libellés identiques dans plusieurs sections
    name = models.CharField(max_length=150)
    # slug globalement unique pour fournir une URL stable
    slug = models.SlugField(max_length=160, unique=True, blank=True, db_index=True)
    position = models.PositiveIntegerField(default=0, db_index=True)
    # la section est portée par le groupe
    section = models.CharField(
        max_length=20,
        choices=Section.choices,
        default=Section.FACADES,
        db_index=True,
    )

    class Meta:
        ordering = ["section", "position", "name"]
        indexes = [
            models.Index(fields=["section"]),
            models.Index(fields=["slug"]),
            models.Index(fields=["position"]),
        ]

    def save(self, *args, **kwargs):
        base = slugify(self.name) or "groupe"
        # garantir unicité globale du slug avec suffixe si collision
        self.slug = _uniqueify_slug_for_group_model(base, self, instance_pk=self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


def color_image_path(instance, filename):
    # Note : si le slug d'une couleur change, les anciens fichiers restent à l'ancien chemin
    return f"colors/{instance.color.slug}/gallery/{filename}"


class Color(models.Model):
    group = models.ForeignKey(
        ColorGroup,
        related_name="colors",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=150)
    # slug NON unique globalement ; unicité assurée PAR GROUPE via contrainte + suffixation
    slug = models.SlugField(max_length=160, blank=True, db_index=True)
    position = models.PositiveIntegerField(default=0, db_index=True)
    clicks = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["group__position", "position", "name"]
        constraints = [
            # Empêche seulement les doublons au sein DU MÊME GROUPE, insensible à la casse :
            UniqueConstraint(
                "group",
                Lower("name"),
                name="uniq_color_name_ci_per_group",
            ),
            # Slug unique PAR GROUPE (permet le même slug dans un autre groupe) :
            UniqueConstraint(
                "group",
                "slug",
                name="uniq_color_slug_per_group",
            ),
        ]
        indexes = [
            models.Index(fields=["group", "position"]),
            models.Index(fields=["slug"]),
            models.Index(fields=["position"]),
        ]

    def save(self, *args, **kwargs):
        # slug de base depuis le nom (peut rester vide si name vide ; on gère ensuite)
        base = slugify(self.name) or "couleur"
        # si pas de group (nullable), on suffixe quand même dans le "pseudo-groupe None"
        if self.group_id:
            self.slug = _uniqueify_slug_for_group(base, self.group, instance_pk=self.pk)
        else:
            # unicité logique pour group=None : on évite les collisions entre couleurs sans groupe
            existing = Color.objects.filter(group__isnull=True, slug=base)
            if self.pk:
                existing = existing.exclude(pk=self.pk)
            if not existing.exists():
                self.slug = base
            else:
                i = 2
                while True:
                    candidate = f"{base}-{i}"
                    e2 = Color.objects.filter(group__isnull=True, slug=candidate)
                    if self.pk:
                        e2 = e2.exclude(pk=self.pk)
                    if not e2.exists():
                        self.slug = candidate
                        break
                    i += 1

        super().save(*args, **kwargs)

    @property
    def presentation(self):
        return self.images.filter(is_presentation=True).first()

    def __str__(self):
        # Affichage utile en admin
        if self.group:
            return f"{self.name} · {self.group.section} / {self.group.name}"
        return self.name


class ColorImage(models.Model):
    color = models.ForeignKey(Color, related_name="images", on_delete=models.CASCADE)
    image = models.ImageField(upload_to=color_image_path)
    # URL stockée (relative /media/... en dev, absolue si storage distant)
    file_url = models.URLField(max_length=500, blank=True, editable=False)
    is_presentation = models.BooleanField(default=False)
    position = models.PositiveIntegerField(default=0, db_index=True)
    alt = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["color", "position", "id"]),
            models.Index(fields=["position"]),
        ]

    def __str__(self):
        return self.image.name or f"image-{self.pk}"

    def update_file_url(self, commit=True):
        """
        Met à jour file_url via le storage configuré.
        - FileSystemStorage (dev) : '/media/...'
        - S3/GCS/Cloudfront (prod) : URL publique.
        """
        if self.image and self.image.name:
            self.file_url = default_storage.url(self.image.name)
            if commit and self.pk:
                type(self).objects.filter(pk=self.pk).update(file_url=self.file_url)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_presentation:
            ColorImage.objects.filter(color=self.color).exclude(pk=self.pk).update(is_presentation=False)
        self.update_file_url(commit=True)
