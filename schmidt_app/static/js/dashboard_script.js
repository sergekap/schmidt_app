document.addEventListener("DOMContentLoaded", function () {
  // ==============================
  // Utils & config
  // ==============================
  const STATIC_URL = (document.querySelector('meta[name="static-url"]') || {}).content || '/static/';
  const CSRF_TOKEN = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
  const presentationAddTile = document.getElementById("presentationAddTile");

  const jsonHeaders = () => ({
    'Content-Type': 'application/json',
    'X-CSRFToken': CSRF_TOKEN || (document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/) || [, ''])[2]
  });
  const csrfOnly = () => ({
    'X-CSRFToken': CSRF_TOKEN || (document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/) || [, ''])[2]
  });
  const toStatic = (p) => STATIC_URL + String(p).replace(/^\/+/, '');

  const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="14" fill="%239ca3af">image indisponible</text></svg>';
  function setFallback(el) { el.onerror = null; el.src = FALLBACK_IMG; }

  // ==============================
  // Icônes
  // ==============================
  const iconEdit  = () => `<svg class="action-icon edit-icon" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5"><path d="m16.5 3.5 4 4L7 21l-4 1 1-4L16.5 3.5z"/></svg>`;
  const iconTrash = () => `<svg class="action-icon delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
  const iconDrag  = () => `<svg class="drag-handle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

  // ==============================
  // API client (IDs pour /api/colors/*)
  // ==============================
  const API = {
    // ------- Groupes -------
    async listGroups(section) {
      const r = await fetch(`/api/groups/?section=${encodeURIComponent(section||'facades')}`);
      if (!r.ok) throw new Error('GET groups failed');
      return (await r.json()).results || [];
    },
    async createGroup(name, section) {
      const r = await fetch(`/api/groups/`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ name, section })
      });
      if (!r.ok) throw new Error('POST group failed');
      return r.json();
    },
    async patchGroup(slug, data) {
      const r = await fetch(`/api/groups/${encodeURIComponent(slug)}/`, {
        method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify(data)
      });
      if (!r.ok) throw new Error('PATCH group failed');
      return r.json();
    },
    async deleteGroup(slug) {
      const r = await fetch(`/api/groups/${encodeURIComponent(slug)}/`, {
        method: 'DELETE', headers: csrfOnly()
      });
      if (r.status !== 204) throw new Error('DELETE group failed');
    },
    async reorderGroupPositions(slugs) {
      for (let i = 0; i < slugs.length; i++) {
        await this.patchGroup(slugs[i], { position: i });
      }
    },
    // Réordonne les couleurs d’un groupe (attend des IDs côté back)
    async reorderColors(groupSlug, ids) {
      const r = await fetch(`/api/groups/${encodeURIComponent(groupSlug)}/colors/reorder`, {
        method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify({ order: ids })
      });
      if (!r.ok) throw new Error('PATCH reorder colors failed');
      return r.json();
    },
    // Créer une couleur dans un groupe
    async createColor(groupSlug, name) {
      const r = await fetch(`/api/groups/${encodeURIComponent(groupSlug)}/colors/`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name })
      });
      if (!r.ok) throw new Error('POST color failed');
      return r.json(); // {id, name, slug, ...}
    },

    // ------- Couleurs & images (ID requis) -------
    async patchColor(colorId, data) {
      const r = await fetch(`/api/colors/${colorId}/`, {
        method:'PATCH', headers: jsonHeaders(), body: JSON.stringify(data)
      });
      if (!r.ok) throw new Error('PATCH color failed');
      return r.json();
    },
    async deleteColor(colorId) {
      const r = await fetch(`/api/colors/${colorId}/`, {
        method:'DELETE', headers: csrfOnly()
      });
      if (r.status !== 204) throw new Error('DELETE color failed');
    },
    async getColorImages(colorId) {
      const r = await fetch(`/api/colors/${colorId}/images/`);
      if (!r.ok) throw new Error('GET images failed');
      return r.json();
    },
    async uploadImages(colorId, files, isPresentation=false) {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      fd.append('is_presentation', isPresentation ? 'true' : 'false');
      const r = await fetch(`/api/colors/${colorId}/images/`, {
        method:'POST', headers: csrfOnly(), body: fd
      });
      if (!r.ok) throw new Error('POST images failed');
      return r.json();
    },
    async setPresentation(colorId, imageId) {
      const r = await fetch(`/api/colors/${colorId}/images/`, {
        method:'PATCH', headers: jsonHeaders(), body: JSON.stringify({ presentation_id: imageId })
      });
      if (!r.ok) throw new Error('PATCH set presentation failed');
    },
    async reorderGallery(colorId, ids) {
      const r = await fetch(`/api/colors/${colorId}/images/`, {
        method:'PATCH', headers: jsonHeaders(), body: JSON.stringify({ order: ids })
      });
      if (!r.ok) throw new Error('PATCH reorder gallery failed');
    },
    async deleteImage(colorId, imageId) {
      const r = await fetch(`/api/colors/${colorId}/images/${imageId}/`, {
        method:'DELETE', headers: csrfOnly()
      });
      if (r.status !== 204) throw new Error('DELETE image failed');
    }
  };

  // ==============================
  // Navigation (boutons blancs)
  // ==============================
  const navButtons = document.querySelectorAll(".nav-button");
  let currentSection = "facades";
  navButtons.forEach(btn=>{
    btn.addEventListener("click",function(){
      navButtons.forEach(b=>b.classList.remove("active"));
      this.classList.add("active");
      currentSection=this.getAttribute("data-section");
      handleSectionDisplay(currentSection);
    });
  });
  const facadesButton=document.querySelector('[data-section="facades"]'); if(facadesButton) facadesButton.click();

  // ==============================
  // État
  // ==============================
  let groups=[];

  // ==============================
  // Bandeau d'enregistrement
  // ==============================
  const saveBanner=document.getElementById("saveBanner");
  const saveBannerSave=document.getElementById("saveBannerSave");
  const saveBannerCancel=document.getElementById("saveBannerCancel");
  const saveBannerMsg=document.getElementById("saveBannerMsg");
  let pendingOps=[]; let originalSnapshot=null;
  const deepCopy=(x)=>JSON.parse(JSON.stringify(x));

  function updateSaveBannerText(){
    if(!saveBannerMsg) return;
    const n=pendingOps.length;
    saveBannerMsg.textContent= n>0
      ? `Voulez-vous enregistrer les modifications ? (${n} modification${n>1?'s':''} en attente)`
      : `Voulez-vous enregistrer les modifications ?`;
  }
  function showSaveBanner(){ saveBanner && saveBanner.classList.add("show"); updateSaveBannerText(); }
  function hideSaveBanner(){ saveBanner && saveBanner.classList.remove("show"); }
  // dédup simple par signature JSON
  function queueOp(op){
    const sig = JSON.stringify(op);
    if(!pendingOps.some(o=>JSON.stringify(o)===sig)){
      pendingOps.push(op); updateSaveBannerText();
    }
  }
  function clearPendingOps(){ pendingOps.length=0; updateSaveBannerText(); }

  saveBannerCancel && saveBannerCancel.addEventListener('click',()=>{
    if(originalSnapshot){ groups=deepCopy(originalSnapshot); renderGroups(groups); }
    originalSnapshot=null; clearPendingOps(); hideSaveBanner();
  });

  saveBannerSave && saveBannerSave.addEventListener('click', async () => {
    try {
      for (const op of pendingOps) {
        switch (op.kind) {
          case 'group_delete':      await API.deleteGroup(op.groupSlug); break;
          case 'group_rename':      await API.patchGroup(op.groupSlug, { name: op.name }); break;
          case 'group_reorder':     await API.reorderGroupPositions(op.slugs); break;
          case 'colors_reorder':    await API.reorderColors(op.groupSlug, op.ids); break;

          case 'color_delete':      await API.deleteColor(op.colorId); break;
          case 'color_rename':      await API.patchColor(op.colorId, { name: op.name }); break;

          case 'gallery_reorder':   await API.reorderGallery(op.colorId, op.ids); break;
        }
      }
      clearPendingOps();
      originalSnapshot = null;
      hideSaveBanner();
      groups = await API.listGroups(currentSection);
      renderGroups(groups);
    } catch (e) {
      console.error(e);
      alert("Une erreur est survenue lors de l'enregistrement.");
    }
  });

  async function applyQueuedDeletesOnly() {
    const deletes = pendingOps.filter(op => op.kind === "color_delete");
    if (!deletes.length) return;
    for (const op of deletes) {
      try { await API.deleteColor(op.colorId); } catch (e) { console.warn(e); }
    }
    pendingOps = pendingOps.filter(op => op.kind !== "color_delete");
    if (pendingOps.length === 0) hideSaveBanner();
  }

  // ==============================
  // Rendu principal
  // ==============================
  async function handleSectionDisplay(section){
    const imageLibraryContainer=document.getElementById("imageLibraryContainer");
    const userManagementContainer=document.getElementById("userManagementContainer");
    const performanceContainer=document.getElementById("performanceContainer");
    if(userManagementContainer) userManagementContainer.style.display="none";
    if(performanceContainer) performanceContainer.style.display="none";
    if(imageLibraryContainer) imageLibraryContainer.style.display="block";

    currentSection=section;
    groups=await API.listGroups(currentSection);
    renderGroups(groups);

    document.querySelectorAll(".sidebar-item").forEach(i=>i.classList.remove("active"));
    const imageLibraryBtn=document.getElementById("imageLibraryBtn");
    imageLibraryBtn && imageLibraryBtn.classList.add("active");
  }

  function makeInlineGroupTitleEditor(){}

  function renderGroups(data){
    const dashboardContent = document.getElementById("dashboardContent");
    dashboardContent.innerHTML = "";
    dashboardContent.style.display = "block";
    data.sort((a,b)=>(a.position-b.position)||a.name.localeCompare(b.name));

    data.forEach(group=>{
      const section = document.createElement("div");
      section.className = "color-section";
      section.dataset.groupSlug = group.slug;

      const header = document.createElement("div");
      header.className = "color-section-header";

      const dragHandleEl = document.createElement("div");
      dragHandleEl.className = "drag-handle-container";
      dragHandleEl.innerHTML = iconDrag();

      const title = document.createElement("h2");
      title.className = "color-section-title";
      title.textContent = group.name;
      title.title = "Double-cliquez pour renommer";

      const actions = document.createElement("div");
      actions.className = "section-actions";
      actions.innerHTML = iconEdit() + iconTrash();

      header.appendChild(dragHandleEl);
      header.appendChild(title);
      header.appendChild(actions);
      section.appendChild(header);

      // === Édition inline du titre (dblclick ou icône crayon)
      (function attachInlineEditor(tEl, g){
        let editing = false;
        let original = "";

        function start(){
          if (editing) return;
          editing = true;
          original = g.name || tEl.textContent.trim();
          tEl.setAttribute("contenteditable","true");
          tEl.classList.add("editing");
          const range = document.createRange();
          range.selectNodeContents(tEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          tEl.focus();
        }
        async function stop(commit){
          if (!editing) return;
          const newName = tEl.textContent.trim();
          tEl.removeAttribute("contenteditable");
          tEl.classList.remove("editing");
          editing = false;

          if (!commit){ tEl.textContent = original; return; }
          if (!newName || newName === original){ tEl.textContent = original; return; }

          try{
            const updated = await API.patchGroup(g.slug, { name: newName });
            g.name = updated.name;
            tEl.textContent = updated.name;
            groups = await API.listGroups(currentSection);
            renderGroups(groups);
          }catch(e){
            console.error(e);
            alert("Impossible de renommer le groupe pour le moment.");
            tEl.textContent = original;
          }
        }

        tEl.addEventListener("dblclick", (e)=>{ e.preventDefault(); start(); });
        tEl.addEventListener("keydown", (e)=>{
          if (!editing) return;
          if (e.key === "Enter"){ e.preventDefault(); stop(true); }
          else if (e.key === "Escape"){ e.preventDefault(); stop(false); }
        });
        tEl.addEventListener("blur", ()=>{ if (editing) stop(true); });

        const editBtn = actions.querySelector(".edit-icon");
        editBtn.addEventListener("click", (e)=>{ e.preventDefault(); start(); });
      })(title, group);

      const groupDelIcon = actions.querySelector(".delete-icon");
      groupDelIcon.addEventListener("click", ()=>{
        if(!originalSnapshot) originalSnapshot = deepCopy(groups);
        groups = groups.filter(g=>g.slug!==group.slug);
        renderGroups(groups);
        queueOp({ kind:"group_delete", groupSlug:group.slug });
        showSaveBanner();
      });

      const bubbles = document.createElement("div");
      bubbles.className = "color-bubbles-container";

      group.colors
        .sort((a,b)=>(a.position-b.position)||a.name.localeCompare(b.name))
        .forEach(color=>{
          const bubble = document.createElement("div");
          bubble.className = "color-bubble";
          bubble.dataset.colorId = color.id;      // <-- ID pour les appels API
          bubble.dataset.colorSlug = color.slug;
          bubble.dataset.groupSlug = group.slug;

          const handle = document.createElement("div");
          handle.className = "bubble-drag-handle-container";
          handle.innerHTML = iconDrag();

          const text = document.createElement("span");
          text.className = "bubble-text font-vertical-fix";
          text.textContent = color.name;
          text.addEventListener("click", ()=>openColorEdit(color, group));

          // bouton poubelle
          const bubbleDelBtn = document.createElement("button");
          bubbleDelBtn.className = "bubble-delete-btn";
          bubbleDelBtn.title = "Supprimer ce coloris";
          bubbleDelBtn.setAttribute("aria-label", "Supprimer ce coloris");
          bubbleDelBtn.innerHTML = iconTrash();

          bubbleDelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!originalSnapshot) originalSnapshot = deepCopy(groups);
            const g = groups.find(g => g.slug === group.slug);
            if (g) g.colors = g.colors.filter(c => c.id !== color.id);
            renderGroups(groups);
            queueOp({ kind: "color_delete", colorId: color.id, groupSlug: group.slug });
            showSaveBanner();
          });

          bubble.appendChild(handle);
          bubble.appendChild(text);
          bubble.appendChild(bubbleDelBtn);
          bubbles.appendChild(bubble);
        });

      const addBubble = document.createElement("div");
      addBubble.className = "add-color-bubble";
      addBubble.title = `Ajouter un coloris dans "${group.name}"`;
      addBubble.addEventListener("click", ()=>window.openAddColorModal(group.slug));
      bubbles.appendChild(addBubble);

      section.appendChild(bubbles);
      dashboardContent.appendChild(section);
    });

    const addSectionContainer = document.createElement("div");
    addSectionContainer.className = "add-section-container";
    const addTitleBtn = document.createElement("button");
    addTitleBtn.className = "add-title-btn";
    addTitleBtn.title = "Ajouter un nouveau groupe";
    addTitleBtn.addEventListener("click", ()=>inlineCreateGroup(addSectionContainer));
    addSectionContainer.appendChild(addTitleBtn);
    dashboardContent.appendChild(addSectionContainer);

    activateDnd();
  }

  // ==============================
  // Inline edit / create group
  // ==============================
  function inlineEditGroupName(titleEl,group){ /* conservé si besoin */ }

  function inlineCreateGroup(container){
    const addBtn=container.querySelector(".add-title-btn"); addBtn.style.display="none";

    const input=document.createElement("input");
    input.type="text";
    input.className="edit-input";
    input.placeholder="Nom du groupe";

    const btns=document.createElement("div"); btns.className="edit-actions";
    const save=document.createElement("button"); save.textContent="✓"; save.className="edit-btn save-btn";
    const cancel=document.createElement("button"); cancel.textContent="✕"; cancel.className="edit-btn cancel-btn";
    btns.appendChild(save); btns.appendChild(cancel);

    container.classList.add("new-group-editor");

    container.appendChild(input); container.appendChild(btns); input.focus();

    const restore=()=>{ input.remove(); btns.remove(); addBtn.style.display=""; container.classList.remove("new-group-editor"); };
    cancel.addEventListener("click",restore);

    save.addEventListener("click",async()=>{
      const name=input.value.trim();
      if(name) await API.createGroup(name,currentSection);
      groups=await API.listGroups(currentSection);
      renderGroups(groups);
    });
  }

  // ==============================
  // Add Color modal (safe, single-init)
  // ==============================
  if (!window.__SCHMIDT_ADD_COLOR_INIT__) {
    window.__SCHMIDT_ADD_COLOR_INIT__ = true;

    const addColorModal   = document.getElementById("addColorModal");
    const addColorOverlay = addColorModal ? addColorModal.querySelector(".color-edit-overlay") : null;
    const addColorClose   = addColorModal ? addColorModal.querySelector(".color-edit-close") : null;
    const addColorForm    = document.getElementById("addColorForm");
    const newColorName    = document.getElementById("newColorName");

    // Inputs & zones
    const presInput   = document.getElementById("newColorPresentation");
    const presDrop    = document.getElementById("newColorPresentationDrop");
    const presPreview = document.getElementById("newColorPresentationPreview");

    const galInput    = document.getElementById("newColorGallery");
    const galDrop     = document.getElementById("newColorGalleryDrop");
    const galPreview  = document.getElementById("newColorGalleryPreview");

    // Buffers pour l'ajout (NE PAS s'appuyer sur input.files)
    let addColorSelectedGroup = null;
    let presFile = null;             // File ou null
    let galleryFiles = [];           // Array<File>

    function fileKey(f){ return `${f.name}__${f.size}__${f.lastModified}`; }
    function emptyFileList(input){ if(!input) return; const dt = new DataTransfer(); input.files = dt.files; }

    // ===== Présentation =====
    function clearPresentationPreview(){
      if (!presPreview || !presDrop) return;
      presFile = null;
      presPreview.innerHTML = "";
      presPreview.style.display = "none";
      presDrop.style.display = "flex";
      emptyFileList(presInput);
    }
    function renderPresentationPreview(file){
      if(!file){ clearPresentationPreview(); return; }
      const url = URL.createObjectURL(file);
      presPreview.innerHTML = `
        <div class="preview-card">
          <img alt="" src="${url}">
          <button type="button" class="preview-delete" aria-label="Supprimer">×</button>
        </div>`;
      presPreview.style.display = "block";
      presDrop.style.display = "none";
      presPreview.querySelector(".preview-delete").onclick = () => { URL.revokeObjectURL(url); clearPresentationPreview(); };
    }
    function handlePresentationFiles(files){
      if(!files || !files[0]) return;
      presFile = files[0];
      renderPresentationPreview(presFile);
      emptyFileList(presInput);
    }

    // ===== Galerie =====
    function renderGalleryThumbs(){
      if (!galPreview) return;
      galPreview.innerHTML = "";
      galleryFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        const wrap = document.createElement("div");
        wrap.className = "thumb";
        wrap.innerHTML = `
          <img alt="" src="${url}">
          <button type="button" class="del" aria-label="Supprimer">×</button>`;
        wrap.querySelector(".del").onclick = () => {
          galleryFiles.splice(index, 1);
          URL.revokeObjectURL(url);
          renderGalleryThumbs();
        };
        galPreview.appendChild(wrap);
      });
    }
    function addGalleryFiles(filesLike){
      const incoming = [...(filesLike || [])];
      if(!incoming.length) return;
      const seen = new Set(galleryFiles.map(fileKey));   // dédup
      incoming.forEach(f => { const k = fileKey(f); if(!seen.has(k)){ seen.add(k); galleryFiles.push(f); } });
      renderGalleryThumbs();
      emptyFileList(galInput);
    }

    // ===== Bindings (protégés) =====
    if (presDrop && !presDrop.dataset.bound) {
      presDrop.addEventListener("click", () => presInput && (presInput.value = "", presInput.click()));
      presDrop.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); presInput && (presInput.value = "", presInput.click()); }
      });
      presDrop.dataset.bound = "1";
    }
    if (presInput && !presInput.dataset.bound) {
      presInput.addEventListener("change", e => handlePresentationFiles(e.target.files));
      presInput.dataset.bound = "1";
    }

    if (galDrop && !galDrop.dataset.bound) {
      galDrop.addEventListener("click", () => galInput && (galInput.value = "", galInput.click()));
      galDrop.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); galInput && (galInput.value = "", galInput.click()); }
      });
      galDrop.dataset.bound = "1";
    }
    if (galInput && !galInput.dataset.bound) {
      galInput.addEventListener("change", e => addGalleryFiles(e.target.files)); // pas de value=""
      galInput.dataset.bound = "1";
    }

    // ===== Ouvrir/fermer le modal d’ajout =====
    window.openAddColorModal = function openAddColorModal(groupSlug){
      addColorSelectedGroup = groupSlug || addColorSelectedGroup || null;
      presFile = null;
      galleryFiles = [];
      if (newColorName) newColorName.value = "";
      clearPresentationPreview();
      renderGalleryThumbs();
      addColorModal.classList.add("active");
      document.body.style.overflow = "hidden";
      setTimeout(()=> newColorName && newColorName.focus(), 40);
    };

    function resetAddColorState() {
      presFile = null;
      galleryFiles = [];
      if (newColorName) newColorName.value = "";
      const emptyFileList = (input) => { if (!input) return; const dt = new DataTransfer(); input.files = dt.files; };
      emptyFileList(document.getElementById("newColorPresentation"));
      emptyFileList(document.getElementById("newColorGallery"));
      const presPreview = document.getElementById("newColorPresentationPreview");
      const presDrop    = document.getElementById("newColorPresentationDrop");
      if (presPreview) { presPreview.innerHTML = ""; presPreview.style.display = "none"; }
      if (presDrop)    { presDrop.style.display    = "flex"; }
      const galPreview = document.getElementById("newColorGalleryPreview");
      if (galPreview)  { galPreview.innerHTML = ""; }
      if (addColorForm) addColorForm.dataset.submitting = "";
    }

    function closeAddColorModal() {
      resetAddColorState();
      const addColorModal = document.getElementById("addColorModal");
      if (addColorModal) addColorModal.classList.remove("active");
      document.body.style.overflow = "";
    }

    document.querySelector("#addColorModal .color-edit-close")?.addEventListener("click", closeAddColorModal);
    document.querySelector("#addColorModal .color-edit-overlay")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("color-edit-overlay")) closeAddColorModal();
    });
    document.addEventListener("keydown", (e) => {
      const addColorModal = document.getElementById("addColorModal");
      if (e.key === "Escape" && addColorModal?.classList.contains("active")) {
        closeAddColorModal();
      }
    });

    // ===== Submit (anti double-submit) =====
    if (addColorForm && !addColorForm.dataset.bound) {
      addColorForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await applyQueuedDeletesOnly();
        if (addColorForm.dataset.submitting === "1") return;
        addColorForm.dataset.submitting = "1";

        const name = (newColorName && newColorName.value.trim()) || "";
        const groupSlug = addColorSelectedGroup || (typeof currentSection === 'string' ? currentSection : null);
        if(!name){ alert("Veuillez saisir le nom du coloris."); addColorForm.dataset.submitting = ""; return; }
        if(!groupSlug){ alert("Groupe introuvable."); addColorForm.dataset.submitting = ""; return; }

        try {
          const created = await API.createColor(groupSlug, name); // -> {id, slug, ...}
          if (presFile) {
            await API.uploadImages(created.id, [presFile], true);
          }
          if (galleryFiles.length) {
            await API.uploadImages(created.id, galleryFiles, false);
          }
          groups = await API.listGroups(currentSection);
          renderGroups(groups);
          closeAddColorModal();
        } catch (err) {
          console.error(err);
          alert("Impossible d'ajouter ce coloris pour le moment.");
        } finally {
          addColorForm.dataset.submitting = "";
        }
      });
      addColorForm.dataset.bound = "1";
    }

    // bouton “Annuler”
    document.getElementById("cancelAddColorBtn")?.addEventListener("click", closeAddColorModal);
  }

  // ==============================
  // Color edit modal (images)
  // ==============================
  const colorEditModal=document.getElementById("colorEditModal");
  const colorEditOverlay=colorEditModal?colorEditModal.querySelector(".color-edit-overlay"):null;
  const colorEditClose=colorEditModal?colorEditModal.querySelector(".color-edit-close"):null;
  const colorEditTitle=document.getElementById("colorEditTitle");
  const presentationImage=document.getElementById("presentationImage");
  const galleryContainer=document.getElementById("galleryContainer");
  const presentationFileInput=document.getElementById("presentationFile");
  const presentationUploadBtn=document.getElementById("presentationUploadBtn");
  const galleryFilesInput=document.getElementById("galleryFiles");

  let currentColor=null; let currentGroup=null;
  let currentPresentationId = null; // IMPORTANT

  async function openColorEdit(color,group){
    currentColor=color; currentGroup=group; if(!colorEditModal) return;
    colorEditTitle.textContent=color.name; await loadImages();
    colorEditModal.classList.add("active"); document.body.style.overflow="hidden";
  }
  function closeColorEdit(){ colorEditModal && colorEditModal.classList.remove("active"); document.body.style.overflow=""; currentColor=null; currentGroup=null; }
  colorEditClose && colorEditClose.addEventListener("click",closeColorEdit);
  colorEditOverlay && colorEditOverlay.addEventListener("click",closeColorEdit);

  // ====== Édition inline du titre du coloris (h2) ======
  let titleEditing = false;
  function startTitleEdit(){
    if (!currentColor) return;
    titleEditing = true;
    colorEditTitle.setAttribute('contenteditable', 'true');
    colorEditTitle.classList.add('editing');
    const range = document.createRange();
    range.selectNodeContents(colorEditTitle);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    colorEditTitle.focus();
  }
  async function stopTitleEdit(commit){
    if (!titleEditing) return;
    const newName = colorEditTitle.textContent.trim();
    colorEditTitle.removeAttribute('contenteditable');
    colorEditTitle.classList.remove('editing');
    titleEditing = false;

    if (!commit) { colorEditTitle.textContent = currentColor ? currentColor.name : colorEditTitle.textContent; return; }
    if (!currentColor || !newName || newName === currentColor.name) { colorEditTitle.textContent = currentColor ? currentColor.name : newName; return; }

    try {
      const updated = await API.patchColor(currentColor.id, { name: newName });
      currentColor.name = updated.name;
      colorEditTitle.textContent = updated.name;
      for (const g of groups) {
        if (g.slug === currentGroup.slug) {
          const c = g.colors.find(x => x.id === currentColor.id);
          if (c) c.name = updated.name;
          break;
        }
      }
      renderGroups(groups);
    } catch (e) {
      console.error(e);
      alert("Impossible de renommer ce coloris pour le moment.");
      colorEditTitle.textContent = currentColor.name;
    }
  }
  colorEditTitle && colorEditTitle.addEventListener('dblclick', (e) => { e.preventDefault(); startTitleEdit(); });
  colorEditTitle && colorEditTitle.addEventListener('keydown', (e) => {
    if (!titleEditing) return;
    if (e.key === 'Enter') { e.preventDefault(); stopTitleEdit(true); }
    if (e.key === 'Escape') { e.preventDefault(); stopTitleEdit(false); }
  });
  colorEditTitle && colorEditTitle.addEventListener('blur', () => { if (titleEditing) stopTitleEdit(true); });

  // ===== loadImages
  async function loadImages() {
    if (!galleryContainer || !currentColor) return;

    galleryContainer.innerHTML = "";

    const data = await API.getColorImages(currentColor.id);
    currentPresentationId = data && data.presentation ? data.presentation.id : null;

    // --- Présentation ---
    if (data.presentation && presentationImage) {
      presentationImage.src = data.presentation.url;
      presentationImage.style.display = "block";
      presentationImage.onerror = () => { presentationImage.src = toStatic("images/placeholder.jpg"); };
      presentationImage.title = "Cliquer pour remplacer la photo de présentation";

      presentationImage.style.cursor = "pointer";
      presentationImage.setAttribute("role", "button");
      presentationImage.setAttribute("tabindex", "0");
      presentationImage.onclick = () => presentationFileInput && presentationFileInput.click();
      presentationImage.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          presentationFileInput && presentationFileInput.click();
        }
      };

      if (presentationAddTile) presentationAddTile.style.display = "none";
    } else {
      if (presentationImage) {
        presentationImage.style.display = "none";
        presentationImage.style.cursor = "";
        presentationImage.removeAttribute("role");
        presentationImage.removeAttribute("tabindex");
      }
      if (presentationAddTile) {
        presentationAddTile.style.display = "flex";
        presentationAddTile.onclick = () => presentationFileInput && presentationFileInput.click();
      }
    }

    // --- Galerie --
    const galleryItems = (data.gallery || []).filter(
      (img) => img && img.id !== currentPresentationId && !img.is_presentation
    );
    const total = galleryItems.length;

    galleryItems.forEach((img, idx) => {
      const item = document.createElement("div");
      item.className = "gallery-item";
      item.dataset.imageId = img.id;

      const drag = document.createElement("div");
      drag.className = "gallery-drag-handle-container";
      drag.innerHTML = iconDrag();

      const im = document.createElement("img");
      im.src = img.url;
      im.alt = img.alt || "";
      im.onerror = () => { im.src = toStatic("images/placeholder.jpg"); };

      const del = document.createElement("button");
      del.className = "delete-photo-btn";
      del.title = "Supprimer";
      del.innerHTML = iconTrash();
      del.onclick = async () => {
        if (!confirm("Supprimer cette photo ?")) return;
        await API.deleteImage(currentColor.id, img.id);
        await loadImages();
      };

      const counter = document.createElement("div");
      counter.className = "gallery-item-counter";
      counter.innerHTML = `<span>${idx + 1}</span> / <span>${total}</span>`;

      item.appendChild(drag);
      item.appendChild(im);
      item.appendChild(del);
      item.appendChild(counter);


      item.addEventListener("dblclick", async () => {
        const prev = currentPresentationId;
        await API.setPresentation(currentColor.id, img.id);
        if (prev && prev !== img.id) {
          try { await API.deleteImage(currentColor.id, prev); } catch (e) { console.warn(e); }
        }
        await loadImages();
      });

      galleryContainer.appendChild(item);
    });

    // Tuile +
    const addTile = document.createElement("div");
    addTile.className = "add-gallery-photo";
    addTile.innerHTML = '<span class="add-gallery-photo-icon">+</span>';
    addTile.title = "Ajouter des images à la galerie";
    addTile.onclick = () => galleryFilesInput && galleryFilesInput.click();
    galleryContainer.appendChild(addTile);

    activateGalleryDnd();
  }

  // ===== Upload présentation (remplace et supprime l’ancienne)
  presentationUploadBtn && presentationUploadBtn.addEventListener("click",()=>{
    if(!currentColor) return;
    presentationFileInput && presentationFileInput.click();
  });

  presentationFileInput && presentationFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !currentColor) return;

    const prev = currentPresentationId;
    await API.uploadImages(currentColor.id, [file], true);

    if (prev) {
      try { await API.deleteImage(currentColor.id, prev); } catch (err) { console.warn(err); }
    }

    await loadImages();
  });

  galleryFilesInput && galleryFilesInput.addEventListener("change",async(e)=>{
    const files=Array.from(e.target.files||[]);
    e.target.value="";
    if(!files.length || !currentColor) return;
    await API.uploadImages(currentColor.id,files,false);
    await loadImages();
  });

  // ==============================
  // DnD
  // ==============================
  function activateGalleryDnd() {
    if (!galleryContainer) return;

    if (galleryContainer.sortableInstance) {
      galleryContainer.sortableInstance.destroy();
    }

    galleryContainer.sortableInstance = new Sortable(galleryContainer, {
      handle: ".gallery-drag-handle-container",
      draggable: ".gallery-item",
      filter: ".add-gallery-photo",
      animation: 150,
      ghostClass: "sortable-ghost",
      onEnd: () => {
        const ids = Array.from(galleryContainer.querySelectorAll(".gallery-item"))
          .map(n => parseInt(n.dataset.imageId, 10))
          .filter(Boolean);

        const total = ids.length;
        Array.from(galleryContainer.querySelectorAll(".gallery-item")).forEach((item, i) => {
          const counter = item.querySelector(".gallery-item-counter");
          if (counter) {
            const spans = counter.querySelectorAll("span");
            if (spans[0]) spans[0].textContent = String(i + 1);
            if (spans[1]) spans[1].textContent = String(total);
          }
        });

        if (!originalSnapshot) originalSnapshot = deepCopy(groups);
        queueOp({ kind: "gallery_reorder", colorId: currentColor.id, ids });
        showSaveBanner();
      }
    });
  }

  function activateDnd() {
    const sectionsContainer = document.getElementById("dashboardContent");
    if (!sectionsContainer) return;

    if (sectionsContainer.sortableInstance) {
      sectionsContainer.sortableInstance.destroy();
    }
    sectionsContainer.sortableInstance = new Sortable(sectionsContainer, {
      handle: ".drag-handle-container",
      draggable: ".color-section",
      filter: ".add-section-container",
      animation: 150,
      ghostClass: "sortable-ghost",
      onEnd: () => {
        const slugs = Array.from(sectionsContainer.querySelectorAll(".color-section"))
          .map(s => s.dataset.groupSlug)
          .filter(Boolean);

        if (!originalSnapshot) originalSnapshot = deepCopy(groups);
        queueOp({ kind: "group_reorder", slugs });
        showSaveBanner();
      }
    });

    document.querySelectorAll(".color-bubbles-container").forEach(container => {
      if (container.sortableInstance) container.sortableInstance.destroy();

      const groupSlug = container.closest(".color-section").dataset.groupSlug;

      container.sortableInstance = new Sortable(container, {
        handle: ".bubble-drag-handle-container",
        draggable: ".color-bubble",
        filter: ".add-color-bubble",
        animation: 150,
        ghostClass: "sortable-ghost",
        onEnd: () => {
          const ids = Array.from(container.querySelectorAll(".color-bubble"))
            .map(n => {
              const colorId = parseInt(n.dataset.colorId, 10);
              return Number.isFinite(colorId) ? colorId : null;
            })
            .filter(Boolean);

          if (!originalSnapshot) originalSnapshot = deepCopy(groups);
          queueOp({ kind: "colors_reorder", groupSlug, ids });
          showSaveBanner();
        }
      });
    });
  }

  // ==============================
  // Sidebar & sections principales
  // ==============================
  const imageLibraryBtn   = document.getElementById("imageLibraryBtn");
  const performanceBtn    = document.getElementById("performanceBtn");
  const userManagementBtn = document.getElementById("userManagementBtn");

  imageLibraryBtn && imageLibraryBtn.addEventListener("click",(e)=>{ e.preventDefault(); handleSectionDisplay('facades'); setActiveSidebar('image'); });
  performanceBtn && performanceBtn.addEventListener("click",(e)=>{ e.preventDefault(); showPerformance(); setActiveSidebar('perf'); });
  userManagementBtn && userManagementBtn.addEventListener("click",(e)=>{ e.preventDefault(); showUserManagement(); setActiveSidebar('users'); });

  function setActiveSidebar(which){
    document.querySelectorAll(".sidebar-item").forEach(i=>i.classList.remove("active"));
    if(which==='image') imageLibraryBtn && imageLibraryBtn.classList.add("active");
    if(which==='perf')  performanceBtn && performanceBtn.classList.add("active");
    if(which==='users') userManagementBtn && userManagementBtn.classList.add("active");
  }
  function showUserManagement(){ const img=document.getElementById("imageLibraryContainer"); const perf=document.getElementById("performanceContainer"); const users=document.getElementById("userManagementContainer"); if(img) img.style.display="none"; if(perf) perf.style.display="none"; if(users) users.style.display="block"; }
  function showPerformance(){ const img=document.getElementById("imageLibraryContainer"); const perf=document.getElementById("performanceContainer"); const users=document.getElementById("userManagementContainer"); if(img) img.style.display="none"; if(users) users.style.display="none"; if(perf) perf.style.display="block"; const fc=document.getElementById('facadeClicksContainer'); if(fc && !fc.hasChildNodes()) fc.innerHTML='<div class="empty-stats-message">Aucune donnée pour le moment.</div>'; }

  // ==============================
  // Menu hamburger & logout modal
  // ==============================
  function initializeHamburgerMenu(){
    const hamburgerMenu=document.getElementById('hamburgerMenu'); const sidebar=document.getElementById('sidebar'); const sidebarOverlay=document.getElementById('sidebarOverlay');
    function toggleSidebar(){ hamburgerMenu.classList.toggle('active'); sidebar.classList.toggle('active'); sidebarOverlay.classList.toggle('active'); document.body.style.overflow=sidebar.classList.contains('active')?'hidden':''; }
    function closeSidebar(){ hamburgerMenu.classList.remove('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); document.body.style.overflow=''; }
    hamburgerMenu && hamburgerMenu.addEventListener('click',toggleSidebar);
    sidebarOverlay && sidebarOverlay.addEventListener('click',closeSidebar);
    document.querySelectorAll('.sidebar-item').forEach(it=>{ it.addEventListener('click',()=>{ if(window.getComputedStyle(hamburgerMenu).display!=='none') closeSidebar(); }); });
    window.addEventListener('resize',()=>{ if(window.innerWidth>768) closeSidebar(); });
    window.addEventListener('orientationchange',()=>setTimeout(()=>{ if(window.innerWidth>768) closeSidebar(); },100));
  }
  function logout(){ const m=document.getElementById('logoutModal'); if(m){ m.classList.add('show'); document.body.style.overflow='hidden'; } }
  function hideLogoutModal(){ const m=document.getElementById('logoutModal'); if(m){ m.classList.remove('show'); document.body.style.overflow=''; } }
  function confirmLogout(){ const f=document.getElementById('logoutForm'); if(f) f.submit(); }
  function initializeLogoutModal(){
    const confirmBtn=document.getElementById('confirmLogout'); const cancelBtn=document.getElementById('cancelLogout'); const modal=document.getElementById('logoutModal'); const ov=modal?modal.querySelector('.logout-modal-overlay'):null;
    confirmBtn && confirmBtn.addEventListener('click',confirmLogout);
    cancelBtn && cancelBtn.addEventListener('click',hideLogoutModal);
    ov && ov.addEventListener('click',hideLogoutModal);
    document.addEventListener('keydown',e=>{ if(e.key==='Escape' && modal && modal.classList.contains('show')) hideLogoutModal(); });
  }
  initializeHamburgerMenu(); initializeLogoutModal(); window.logout=logout;

  // ==============================
  // Gestion des utilisateurs (ADMIN uniquement)
  // ==============================
  if (window.IS_ADMIN) {
    const addUserForm = document.getElementById("addUserForm");
    const userTableBody = document.querySelector("#userTable tbody");
    const roleSelectNew = document.getElementById("newUserRole");

    async function loadUsers(){
      const res=await fetch("/api/users/"); const data=await res.json();
      if(!userTableBody) return;
      userTableBody.innerHTML="";
      data.results.forEach(u=>{
        const tr=document.createElement("tr");
        tr.innerHTML=`
          <td>${u.last_name || ""}</td>
          <td>${u.first_name || ""}</td>
          <td>${u.email}</td>
          <td>
            <select class="role-select" data-id="${u.id}">
              <option value="ADMIN"${u.role==='ADMIN'?' selected':''}>Administrateur</option>
              <option value="MANAGER"${u.role==='MANAGER'?' selected':''}>Gestionnaire</option>
            </select>
          </td>
          <td>
            <button data-id="${u.id}" class="btn-reset">Réinitialiser mdp</button>
            <button data-id="${u.id}" class="btn-delete">Supprimer</button>
          </td>`;
        userTableBody.appendChild(tr);
      });
    }

    addUserForm && addUserForm.addEventListener("submit",async(e)=>{
      e.preventDefault();
      const last_name=document.getElementById("newUserName").value.trim();
      const first_name=document.getElementById("newUserFirstName").value.trim();
      const email=document.getElementById("newUserEmail").value.trim();
      const role=roleSelectNew ? roleSelectNew.value : "MANAGER";
      const res=await fetch("/api/users/",{method:"POST",headers:{"Content-Type":"application/json","X-CSRFToken":CSRF_TOKEN},body:JSON.stringify({first_name,last_name,email,role})});
      if(res.ok){ alert("Utilisateur créé. Un email a été envoyé."); e.target.reset(); loadUsers(); }
      else{ const err=await res.json().catch(()=>({})); alert(err.error || "Erreur lors de la création."); }
    });

    const userTableEl=document.getElementById("userTable");

    userTableEl && userTableEl.addEventListener("change", async (e)=>{
      if(!e.target.classList.contains("role-select")) return;
      const id=parseInt(e.target.dataset.id,10);
      const role=e.target.value;
      const resp=await fetch(`/api/users/${id}/`,{method:"PATCH",headers:{"Content-Type":"application/json","X-CSRFToken":CSRF_TOKEN},body:JSON.stringify({role})});
      if(resp.ok){
        if(window.CURRENT_USER_ID && id===parseInt(window.CURRENT_USER_ID,10)){
          window.IS_ADMIN = (role === 'ADMIN');
          if(!window.IS_ADMIN){
            const btn=document.getElementById('userManagementBtn');
            if(btn) btn.remove();
            const container=document.getElementById('userManagementContainer');
            if(container) container.style.display="none";
            setActiveSidebar('image');
            handleSectionDisplay('facades');
            alert("Votre rôle est maintenant Gestionnaire. Les options d’administration ont été masquées.");
          }
        }
      }else{
        alert("Impossible de changer le rôle.");
        loadUsers();
      }
    });

    userTableEl && userTableEl.addEventListener("click", async (e)=>{
      const id=e.target.dataset.id; if(!id) return;
      if(e.target.classList.contains("btn-reset")){
        if(!confirm("Réinitialiser le mot de passe et obliger l’utilisateur à le changer ?")) return;
        await fetch(`/api/users/${id}/`,{method:"PATCH",headers:{"Content-Type":"application/json","X-CSRFToken":CSRF_TOKEN},body:JSON.stringify({reset_password:true})});
        alert("Email envoyé.");
      }
      if(e.target.classList.contains("btn-delete")){
        if(!confirm("Supprimer cet utilisateur ?")) return;
        await fetch(`/api/users/${id}/`,{method:"DELETE",headers:{"X-CSRFToken":CSRF_TOKEN}});
        loadUsers();
      }
    });

    loadUsers();
  }
});

// Valider/annuler un groupe au clavier (Enter / Esc)
document.addEventListener('keydown', (e) => {
  const editor = e.target.closest('.group-editor, .group-inline-editor, .new-group-editor');
  if (!editor) return;
  if (!e.target.matches('input[type="text"], input:not([type]), textarea')) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    const saveBtn = editor.querySelector('.js-group-save, [data-action="save-group"], .save-btn');
    if (saveBtn) saveBtn.click();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    const cancelBtn = editor.querySelector('.js-group-cancel, [data-action="cancel-group"], .cancel-btn');
    if (cancelBtn) cancelBtn.click();
  }
});