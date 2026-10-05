// Instagram Repost Studio - Cloudflare Pages Static Edition
// 100% Client-side Processing (Canvas Engine + JSZip)

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabUploadBtn = document.getElementById('tab-upload-btn');
  const tabLinkBtn = document.getElementById('tab-link-btn');
  const tabUploadContent = document.getElementById('tab-upload-content');
  const tabLinkContent = document.getElementById('tab-link-content');
  
  const dropZone = document.getElementById('drop-zone');
  const manualFileInput = document.getElementById('manual-file-input');
  
  const instagramUrlInput = document.getElementById('instagram-url');
  const pasteBtn = document.getElementById('paste-btn');
  const fetchBtn = document.getElementById('fetch-btn');
  
  const loadingCard = document.getElementById('loading-card');
  const loadingText = document.getElementById('loading-text');
  const loadingSubtext = document.getElementById('loading-subtext');
  
  const resultSection = document.getElementById('result-section');
  const postAuthor = document.getElementById('post-author');
  const postMeta = document.getElementById('post-meta');
  const captionText = document.getElementById('caption-text');
  const copyCaptionBtn = document.getElementById('copy-caption-btn');
  const addRepostTagBtn = document.getElementById('add-repost-tag-btn');
  
  const downloadAllBtn = document.getElementById('download-all-btn');
  const downloadActiveBtn = document.getElementById('download-active-btn');
  
  const activePreviewImg = document.getElementById('active-preview-img');
  const activeSlideBadge = document.getElementById('active-slide-badge');
  const activeSlideType = document.getElementById('active-slide-type');
  const activeSlideCounter = document.getElementById('active-slide-counter');
  const prevSlideBtn = document.getElementById('prev-slide-btn');
  const nextSlideBtn = document.getElementById('next-slide-btn');
  const thumbnailsContainer = document.getElementById('thumbnails-container');
  
  const offscreenCanvas = document.getElementById('offscreen-canvas');
  const ctx = offscreenCanvas.getContext('2d');

  // Application Constants
  const TEMPLATE_SRC = 'assets/template.png';
  const STICKER_SRC = 'assets/repost_badge.png';
  const FRAME_BOX = { x: 168, y: 186, w: 483, h: 654, r: 42 };
  const STICKER_POS = { x: 540, y: 740 };

  // Preloaded Images
  let templateImage = null;
  let stickerImage = null;

  // Application State
  let slides = []; // array of { number, originalBlob, originalUrl, framedBlob, framedUrl, isFramed }
  let activeSlideIndex = 0;
  let currentFitMode = 'cover';

  // Load Template & Sticker Assets
  Promise.all([loadImage(TEMPLATE_SRC), loadImage(STICKER_SRC)])
    .then(([tImg, sImg]) => {
      templateImage = tImg;
      stickerImage = sImg;
      console.log('Frame assets loaded successfully!');
    })
    .catch((err) => {
      console.warn('Failed to load local assets:', err);
      showToast('Gagal memuat template frame lokal. Pastikan folder assets tersedia.', 'error');
    });

  // Tab switching
  tabUploadBtn.addEventListener('click', () => {
    tabUploadBtn.className = 'px-4 py-2 font-semibold text-sm rounded-lg bg-blue-900 text-white shadow transition-all flex items-center gap-2';
    tabLinkBtn.className = 'px-4 py-2 font-semibold text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all flex items-center gap-2';
    tabUploadContent.classList.remove('hidden');
    tabLinkContent.classList.add('hidden');
  });

  tabLinkBtn.addEventListener('click', () => {
    tabLinkBtn.className = 'px-4 py-2 font-semibold text-sm rounded-lg bg-blue-900 text-white shadow transition-all flex items-center gap-2';
    tabUploadBtn.className = 'px-4 py-2 font-semibold text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all flex items-center gap-2';
    tabLinkContent.classList.remove('hidden');
    tabUploadContent.classList.add('hidden');
  });

  // Paste Link from Clipboard
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        instagramUrlInput.value = text.trim();
        showToast('Link berhasil ditempel!', 'info');
      }
    } catch {
      showToast('Silakan tempel manual dengan tombol Ctrl + V.', 'error');
    }
  });

  // Global Paste Event (Ctrl + V for images)
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      handleFilesSelected(imageFiles);
    }
  });

  // Drag and Drop
  dropZone.addEventListener('click', () => manualFileInput.click());

  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add('border-blue-700', 'bg-blue-100/50');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-blue-700', 'bg-blue-100/50');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      handleFilesSelected(files);
    }
  });

  manualFileInput.addEventListener('change', () => {
    const files = Array.from(manualFileInput.files || []);
    if (files.length > 0) {
      handleFilesSelected(files);
    }
  });

  // Radio button fit mode changes
  document.querySelectorAll('input[name="fit_mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentFitMode = e.target.value;
      if (slides.length > 0) {
        reprocessSlide1Frame();
      }
    });
  });

  document.querySelectorAll('input[name="adjust_fit_mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentFitMode = e.target.value;
      const mainRadio = document.querySelector(`input[name="fit_mode"][value="${currentFitMode}"]`);
      if (mainRadio) mainRadio.checked = true;
      if (slides.length > 0) {
        reprocessSlide1Frame();
      }
    });
  });

  // Handle files processing
  async function handleFilesSelected(fileList) {
    if (!templateImage || !stickerImage) {
      showToast('Memuat aset template... Mohon tunggu 1 detik.', 'info');
      try {
        templateImage = await loadImage(TEMPLATE_SRC);
        stickerImage = await loadImage(STICKER_SRC);
      } catch (err) {
        showToast('Gagal memuat aset frame. Periksa folder assets.', 'error');
        return;
      }
    }

    showLoading('Memproses foto...', 'Menerapkan frame repost ke gambar pertama...');

    try {
      slides = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const num = i + 1;
        const origUrl = URL.createObjectURL(file);
        
        const slideItem = {
          number: num,
          file: file,
          originalBlob: file,
          originalUrl: origUrl,
          isFramed: false,
          framedBlob: null,
          framedUrl: null
        };

        if (i === 0) {
          // Slide 1 gets the custom ATR/BPN Repost Frame
          const framedBlob = await renderFrame(file, currentFitMode);
          slideItem.isFramed = true;
          slideItem.framedBlob = framedBlob;
          slideItem.framedUrl = URL.createObjectURL(framedBlob);
        }

        slides.push(slideItem);
      }

      // Initialize default caption if empty
      if (!captionText.value.trim()) {
        captionText.value = `#Repost @kementerian.atrbpn\n\n`;
      } else if (!captionText.value.includes('#Repost @kementerian.atrbpn')) {
        captionText.value = `#Repost @kementerian.atrbpn\n\n` + captionText.value;
      }

      renderStudioUI();
      showToast(`Berhasil memproses ${slides.length} gambar!`, 'success');

    } catch (err) {
      console.error(err);
      showToast('Terjadi kesalahan saat memproses gambar.', 'error');
    } finally {
      hideLoading();
    }
  }

  // Canvas Frame Rendering Engine
  async function renderFrame(imageFileOrBlob, fitMode) {
    const photo = await loadImage(URL.createObjectURL(imageFileOrBlob));
    
    // Set offscreen canvas to template resolution (819x1024)
    offscreenCanvas.width = 819;
    offscreenCanvas.height = 1024;

    // 1. Draw Template
    ctx.clearRect(0, 0, 819, 1024);
    ctx.drawImage(templateImage, 0, 0, 819, 1024);

    // 2. Clear inner window to pure white (clears Canva hill completely)
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRectPath(ctx, FRAME_BOX.x, FRAME_BOX.y, FRAME_BOX.w, FRAME_BOX.h, FRAME_BOX.r);
    ctx.fill();
    ctx.restore();

    // 3. Clip to rounded rectangle & Draw Photo
    ctx.save();
    drawRoundedRectPath(ctx, FRAME_BOX.x, FRAME_BOX.y, FRAME_BOX.w, FRAME_BOX.h, FRAME_BOX.r);
    ctx.clip();

    const pw = photo.width;
    const ph = photo.height;
    const bw = FRAME_BOX.w;
    const bh = FRAME_BOX.h;

    let nw, nh, nx, ny;
    if (fitMode === 'contain') {
      const scale = Math.min(bw / pw, bh / ph);
      nw = pw * scale;
      nh = ph * scale;
      nx = FRAME_BOX.x + (bw - nw) / 2;
      ny = FRAME_BOX.y + (bh - nh) / 2;
    } else {
      // Cover (default)
      const scale = Math.max(bw / pw, bh / ph);
      nw = pw * scale;
      nh = ph * scale;
      nx = FRAME_BOX.x + (bw - nw) / 2;
      ny = FRAME_BOX.y + (bh - nh) / 2;
    }

    ctx.drawImage(photo, nx, ny, nw, nh);
    ctx.restore();

    // 4. Overlay Repost Badge Sticker on Top (zero green pixels)
    ctx.drawImage(stickerImage, STICKER_POS.x, STICKER_POS.y);

    // 5. Export to PNG Blob
    return new Promise((resolve) => {
      offscreenCanvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
    });
  }

  function drawRoundedRectPath(c, x, y, w, h, r) {
    if (typeof c.roundRect === 'function') {
      c.beginPath();
      c.roundRect(x, y, w, h, r);
    } else {
      // Cross-browser fallback
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
    }
  }

  async function reprocessSlide1Frame() {
    if (!slides.length) return;
    try {
      const framedBlob = await renderFrame(slides[0].originalBlob, currentFitMode);
      slides[0].framedBlob = framedBlob;
      slides[0].framedUrl = URL.createObjectURL(framedBlob);
      renderThumbnails();
      if (activeSlideIndex === 0) {
        selectSlide(0);
      }
      showToast(`Frame diperbarui ke mode "${currentFitMode === 'cover' ? 'Isi Penuh' : 'Tampil Utuh'}"!`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Gagal memperbarui frame.', 'error');
    }
  }

  // Render Studio UI
  function renderStudioUI() {
    postMeta.textContent = `${slides.length} Gambar diproses • Siap diunduh`;
    renderThumbnails();
    selectSlide(0);
    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth' });
  }

  function renderThumbnails() {
    thumbnailsContainer.innerHTML = '';
    slides.forEach((slide, idx) => {
      const thumb = document.createElement('button');
      thumb.className = `relative flex-shrink-0 w-20 h-24 rounded-xl overflow-hidden border-2 transition-all p-0.5 cursor-pointer ${
        idx === activeSlideIndex 
          ? 'border-blue-900 shadow-md scale-105 ring-2 ring-blue-500/50' 
          : 'border-transparent opacity-75 hover:opacity-100'
      }`;

      const imgSrc = slide.isFramed ? slide.framedUrl : slide.originalUrl;
      thumb.innerHTML = `
        <img src="${imgSrc}" class="w-full h-full object-cover rounded-lg" alt="Slide ${slide.number}" />
        <span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${
          slide.isFramed ? 'bg-amber-600' : 'bg-gray-800/80'
        }">${slide.number}</span>
        ${slide.isFramed ? '<span class="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white"></span>' : ''}
      `;

      thumb.addEventListener('click', () => selectSlide(idx));
      thumbnailsContainer.appendChild(thumb);
    });
  }

  function selectSlide(idx) {
    if (idx < 0 || idx >= slides.length) return;
    activeSlideIndex = idx;
    const slide = slides[activeSlideIndex];

    activePreviewImg.style.opacity = '0.4';
    setTimeout(() => {
      activePreviewImg.src = slide.isFramed ? slide.framedUrl : slide.originalUrl;
      activePreviewImg.style.opacity = '1';
    }, 120);

    activeSlideCounter.textContent = `${slide.number} / ${slides.length}`;
    if (slide.isFramed) {
      activeSlideBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white flex items-center gap-1.5 shadow-sm';
      activeSlideType.textContent = 'Slide 1: Repost (Frame)';
    } else {
      activeSlideBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-blue-900 text-white flex items-center gap-1.5 shadow-sm';
      activeSlideType.textContent = `Slide ${slide.number}`;
    }

    prevSlideBtn.disabled = activeSlideIndex === 0;
    nextSlideBtn.disabled = activeSlideIndex === slides.length - 1;

    const thumbs = thumbnailsContainer.children;
    for (let i = 0; i < thumbs.length; i++) {
      if (i === activeSlideIndex) {
        thumbs[i].className = 'relative flex-shrink-0 w-20 h-24 rounded-xl overflow-hidden border-2 border-blue-900 shadow-md scale-105 ring-2 ring-blue-500/50 transition-all p-0.5 cursor-pointer';
      } else {
        thumbs[i].className = 'relative flex-shrink-0 w-20 h-24 rounded-xl overflow-hidden border-2 border-transparent opacity-75 hover:opacity-100 transition-all p-0.5 cursor-pointer';
      }
    }
  }

  prevSlideBtn.addEventListener('click', () => selectSlide(activeSlideIndex - 1));
  nextSlideBtn.addEventListener('click', () => selectSlide(activeSlideIndex + 1));

  // Download All as ZIP (Client-Side via JSZip)
  downloadAllBtn.addEventListener('click', async () => {
    if (!slides.length) return;
    showToast('Membuat arsip ZIP di browser...', 'info');

    try {
      const zip = new JSZip();

      // 1. Add Slide 1 Framed
      zip.file('01_repost.png', slides[0].framedBlob);

      // 2. Add remaining slides (Slide 2 to N)
      for (let i = 1; i < slides.length; i++) {
        const s = slides[i];
        const numStr = String(s.number).padStart(2, '0');
        const ext = s.file.name.split('.').pop() || 'jpg';
        zip.file(`${numStr}_slide.${ext}`, s.originalBlob);
      }

      // 3. Add caption file
      const captionContent = captionText.value.trim();
      if (captionContent) {
        zip.file('caption.txt', captionContent);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, 'repost_atrbpn_polman.zip');
      showToast('Arsip ZIP berhasil diunduh!', 'success');

    } catch (err) {
      console.error(err);
      showToast('Gagal membuat file ZIP.', 'error');
    }
  });

  // Download Active Slide
  downloadActiveBtn.addEventListener('click', () => {
    if (!slides.length) return;
    const slide = slides[activeSlideIndex];
    if (slide.isFramed) {
      saveAs(slide.framedBlob, '01_repost.png');
    } else {
      const numStr = String(slide.number).padStart(2, '0');
      const ext = slide.file.name.split('.').pop() || 'jpg';
      saveAs(slide.originalBlob, `${numStr}_slide.${ext}`);
    }
    showToast(`Mengunduh Slide ${slide.number}...`, 'info');
  });

  // Copy Caption
  copyCaptionBtn.addEventListener('click', async () => {
    const text = captionText.value;
    if (!text) {
      showToast('Tidak ada caption untuk disalin.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Caption postingan berhasil disalin ke clipboard!', 'success');
    } catch {
      captionText.select();
      document.execCommand('copy');
      showToast('Caption berhasil disalin!', 'success');
    }
  });

  // Add #Repost Tag button
  addRepostTagBtn.addEventListener('click', () => {
    const tag = '#Repost @kementerian.atrbpn';
    if (!captionText.value.includes(tag)) {
      captionText.value = `${tag}\n\n` + captionText.value.trim();
      showToast('Tag #Repost @kementerian.atrbpn ditambahkan!', 'success');
    } else {
      showToast('Tag #Repost sudah ada pada caption.', 'info');
    }
  });

  // Sample link click
  const sampleLinkBtn = document.getElementById('sample-link-btn');
  if (sampleLinkBtn) {
    sampleLinkBtn.addEventListener('click', () => {
      instagramUrlInput.value = sampleLinkBtn.textContent.trim();
      handleFetchInstagram();
    });
  }

  // Instagram Link Fetch Handler
  fetchBtn.addEventListener('click', handleFetchInstagram);
  instagramUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFetchInstagram();
  });

  async function handleFetchInstagram() {
    const url = instagramUrlInput.value.trim();
    if (!url) {
      showToast('Masukkan link postingan Instagram terlebih dahulu.', 'error');
      instagramUrlInput.focus();
      return;
    }

    showLoading('Menghubungkan ke Instagram...', 'Mengekstrak carousel gambar dari link...');
    fetchBtn.disabled = true;

    try {
      // 1. Try serverless endpoint /api/fetch (Cloudflare Pages Function)
      let postData = null;
      try {
        const resp = await fetch('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (resp.ok) {
          const res = await resp.json();
          if (res.success && res.images && res.images.length > 0) {
            postData = res;
          } else if (res.error) {
            throw new Error(res.error);
          }
        }
      } catch (err) {
        console.warn('Direct /api/fetch failed or local:', err);
      }

      // 2. If /api/fetch not available (e.g. static local preview), try client-side proxy fallback
      if (!postData) {
        postData = await fetchInstagramClientSide(url);
      }

      if (!postData || !postData.images || !postData.images.length) {
        throw new Error('Gagal mengambil gambar dari link Instagram ini.');
      }

      showLoading('Mengunduh foto carousel...', `Mengunduh ${postData.images.length} gambar untuk diframe...`);

      // 3. Download images into Blobs
      const imageFiles = [];
      for (let i = 0; i < postData.images.length; i++) {
        try {
          let imgResp = null;
          try {
            imgResp = await fetch(imgUrl);
            if (!imgResp.ok) throw new Error('Status not ok');
          } catch {
            imgResp = await fetch(`/api/proxy?url=${encodeURIComponent(imgUrl)}`);
          }
          const blob = await imgResp.blob();
          const ext = blob.type.includes('png') ? 'png' : 'jpg';
          const file = new File([blob], `slide_${i + 1}.${ext}`, { type: blob.type || 'image/jpeg' });
          imageFiles.push(file);
        } catch (e) {
          console.warn(`Gagal fetch gambar ${i+1}:`, e);
        }
      }

      if (imageFiles.length === 0) {
        throw new Error('Gagal mengunduh file gambar postingan.');
      }

      // Update post metadata & author
      const author = postData.author || 'kementerian.atrbpn';
      postAuthor.textContent = `@${author}`;
      
      const repostTag = `#Repost @${author}`;
      const origCaption = (postData.caption || '').trim();
      captionText.value = origCaption.startsWith(repostTag) 
        ? origCaption 
        : `${repostTag}\n\n${origCaption}`;

      // 4. Process through framing engine
      await handleFilesSelected(imageFiles);

    } catch (err) {
      console.error(err);
      showToast(err.message || 'Gagal memproses link Instagram.', 'error');
    } finally {
      hideLoading();
      fetchBtn.disabled = false;
    }
  }

  // Client-side fallback extraction if /api/fetch is not present
  async function fetchInstagramClientSide(rawUrl) {
    const match = rawUrl.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#&]+)/);
    const shortcode = match ? match[1] : rawUrl;
    if (!shortcode) throw new Error('Shortcode tidak valid');

    // Use free CORS proxy to fetch Instagram GraphQL doc_id
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent('https://www.instagram.com/graphql/query');
    const variables = JSON.stringify({
      shortcode: shortcode,
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false
    });

    const params = new URLSearchParams();
    params.append('doc_id', '27128499623469141');
    params.append('variables', variables);
    params.append('server_timestamps', 'true');

    const resp = await fetch(proxyUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-IG-App-ID': '936619743392459'
      }
    });

    const data = await resp.json();
    const webInfo = data?.data?.xdt_api__v1__media__shortcode__web_info || {};
    const items = webInfo.items || [];
    if (!items.length) throw new Error('Postingan tidak ditemukan atau privat.');

    const item = items[0];
    const author = item.user?.username || 'kementerian.atrbpn';
    const caption = item.caption?.text || '';
    const imageUrls = [];

    if (item.carousel_media && item.carousel_media.length > 0) {
      for (const cm of item.carousel_media) {
        const candidates = cm.image_versions2?.candidates || [];
        if (candidates.length > 0) imageUrls.push(candidates[0].url);
      }
    } else if (item.image_versions2?.candidates?.length > 0) {
      imageUrls.push(item.image_versions2.candidates[0].url);
    }

    return { author, caption, images: imageUrls };
  }

  // Helpers
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  function showLoading(title, subtitle) {
    loadingText.textContent = title;
    loadingSubtext.textContent = subtitle;
    loadingCard.classList.remove('hidden');
    resultSection.classList.add('hidden');
  }

  function hideLoading() {
    loadingCard.classList.add('hidden');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const icon = type === 'success' ? 'circle-check' : type === 'error' ? 'circle-exclamation' : 'circle-info';
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
});
