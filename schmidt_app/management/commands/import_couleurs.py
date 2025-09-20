# -*- coding: utf-8 -*-
"""
Scan schmidt_app/static/couleurs/<section>/<...>/LEAF_DIR_WITH_IMAGES
et importe:
- ColorGroup (depuis le dossier parent du leaf)
- Color (depuis le leaf)
- ColorImage (toutes les images du leaf; la 1re = is_presentation=True)

Structure acceptée et flexible:
  couleurs/
    facades/                -> section FACADES
      GroupeA/
        CouleurX/           -> leaf avec images => group=GroupeA, color=CouleurX
          01.jpg 02.jpg ...
      GroupeB/              -> si images directement ici => group=GroupeB, color=GroupeB
        01.jpg 02.jpg ...
    ambiances/
    pieces/                 -> section ESPACES
    plans_de_travail/       -> section PLANS

Par défaut, si un leaf est directement sous <section>/ (pas de parent de groupe),
le groupe créé s’appelle "Divers".
"""
import os
from pathlib import Path
from typing import List, Tuple

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from django.utils.text import slugify

from schmidt_app.models import Section, ColorGroup, Color, ColorImage

SECTIONS_MAP = {
    "facades": Section.FACADES,
    "ambiances": Section.AMBIANCES,
    "pieces": Section.ESPACES,               # "pieces" => Section.ESPACES
    "plans_de_travail": Section.PLANS,       # "plans_de_travail" => Section.PLANS
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def pretty_name(s: str) -> str:
    s = s.replace("_", " ").replace("-", " ").strip()
    # Garde les majuscules si l’entrée est déjà propre, sinon Title Case.
    return s if any(c.isupper() for c in s) else s.title()


def list_images(p: Path) -> List[Path]:
    files = [f for f in sorted(p.iterdir()) if f.is_file() and f.suffix.lower() in IMAGE_EXTS]
    return files


def find_leaf_dirs_with_images(section_root: Path) -> List[Path]:
    """
    Retourne les dossiers "leaf" (contenant des images) sous section_root.
    Si un dossier contient des images, on l'utilise tel quel, même s'il a des sous-dossiers.
    """
    leaves: List[Path] = []
    for root, dirs, files in os.walk(section_root):
        rp = Path(root)
        if any(Path(root, f).suffix.lower() in IMAGE_EXTS for f in files):
            leaves.append(rp)
            # on ne descend pas plus bas: ce dossier est déjà un leaf logique pour une couleur
            dirs[:] = []
    return sorted(leaves)


class Command(BaseCommand):
    help = "Importe les couleurs et images depuis schmidt_app/static/couleurs/"

    def add_arguments(self, parser):
        parser.add_argument(
            "--base",
            default="schmidt_app/static/couleurs",
            help="Chemin racine des sections (défaut: schmidt_app/static/couleurs)",
        )
        parser.add_argument(
            "--only",
            choices=list(SECTIONS_MAP.keys()),
            help="Limiter à une seule section (facades|ambiances|pieces|plans_de_travail)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="N'écrit rien en base, affiche seulement ce qui serait fait",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Avant d'importer une couleur, supprime ses images existantes",
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        base = Path(opts["base"]).resolve()
        only = opts.get("only")
        dry = opts.get("dry_run", False)
        clear = opts.get("clear", False)

        if not base.exists():
            raise CommandError(f"Base introuvable: {base}")

        # Liste des sections présentes
        section_dirs = [
            d for d in base.iterdir()
            if d.is_dir() and d.name in SECTIONS_MAP and (only is None or d.name == only)
        ]
        if not section_dirs:
            raise CommandError("Aucune section trouvée (ou filtre --only trop restrictif).")

        summary = []

        for section_dir in sorted(section_dirs):
            section_key = section_dir.name
            section_val = SECTIONS_MAP[section_key]
            self.stdout.write(self.style.MIGRATE_HEADING(f"Section: {section_key} → {section_val}"))

            leaves = find_leaf_dirs_with_images(section_dir)
            if not leaves:
                self.stdout.write(self.style.WARNING(f"  (aucun dossier avec images sous {section_dir})"))
                continue

            # Positionnement "basique": l'ordre des leaves pour Color, et index de l'image pour ColorImage
            for color_pos, leaf in enumerate(leaves, start=1):
                images = list_images(leaf)
                if not images:
                    continue

                # Déterminer group_name et color_name
                # leaf = <base>/<section>/<...optional...>/<leaf-name>
                parent = leaf.parent
                is_parent_section = parent == section_dir

                group_name = pretty_name(parent.name) if not is_parent_section else "Divers"
                color_name = pretty_name(leaf.name)

                # Créer/obtenir le groupe
                group_defaults = {"position": 0, "section": section_val}
                group, created_g = ColorGroup.objects.get_or_create(
                    name=group_name,
                    section=section_val,
                    defaults=group_defaults,
                )

                # Créer/obtenir la couleur
                color_defaults = {"group": group, "position": color_pos}
                color, created_c = Color.objects.get_or_create(
                    group=group,
                    name=color_name,
                    defaults=color_defaults,
                )
                # Mettre à jour position si nouvelle itération veut réordonner
                if not dry and color.position != color_pos:
                    color.position = color_pos
                    color.save(update_fields=["position"])

                action = "CREATE" if created_c else "UPDATE"
                self.stdout.write(f"  {action}: [{section_key}] {group.name} / {color.name}  ({len(images)} images)")

                if clear and not dry:
                    color.images.all().delete()

                # Import des images
                for idx, img_path in enumerate(images):
                    is_presentation = (idx == 0)
                    if dry:
                        self.stdout.write(f"     - {'[P] ' if is_presentation else ''}{img_path.name}")
                        continue

                    with img_path.open("rb") as f:
                        img = ColorImage(
                            color=color,
                            is_presentation=is_presentation,
                            position=idx + 1,
                            alt=f"{color.name} – {group.name}",
                        )
                        # Important: donner un nom stable au fichier (gardera le nom d'origine)
                        img.image.save(img_path.name, File(f), save=True)

                summary.append((section_key, group.name, color.name, len(images)))

        if dry:
            self.stdout.write(self.style.NOTICE("\nDry-run terminé. Rien n'a été écrit en base."))
        else:
            self.stdout.write(self.style.SUCCESS("\nImport terminé avec succès."))
