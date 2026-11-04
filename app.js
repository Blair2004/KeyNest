(() => {
  'use strict';

  const STORAGE_KEY = 'keynest-vault-v1';
  const DEFAULT_FIELDS = [
    { id: 'email', label: 'Email' },
    { id: 'identifier', label: 'Identifier' }
  ];

  const state = {
    fields: [],
    accounts: [],
    filter: 'all',
    status: 'active',
    query: '',
    sort: 'manual',
    view: 'accounts'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const grid = $('#accountGrid');
  const backdrop = $('#modalBackdrop');
  const dialogs = $$('.dialog');
  const logoPalettes = [
    ['#625fe4', '#817ef1'], ['#e05666', '#f08377'], ['#2476b9', '#4b9ad0'],
    ['#2b9d79', '#5cc39e'], ['#cd6a35', '#e99a5b'], ['#8a59bc', '#b47bd2'],
    ['#3c465e', '#68758f'], ['#d99d26', '#efbf54']
  ];
  const nameRegions = Array.isArray(window.CAMEROON_NAME_DATA) ? window.CAMEROON_NAME_DATA : [];
  const givenNameStyles = window.CAMEROON_GIVEN_NAME_STYLES || {};
  let currentGeneratedName = null;

  function uid() {
    return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      state.fields = Array.isArray(saved?.fields) ? saved.fields : structuredClone(DEFAULT_FIELDS);
      state.accounts = Array.isArray(saved?.accounts) ? saved.accounts.map(normalizeAccount) : [];
    } catch {
      state.fields = structuredClone(DEFAULT_FIELDS);
      state.accounts = [];
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, fields: state.fields, accounts: state.accounts }));
  }

  function normalizeAccount(account) {
    return {
      id: account.id || uid(),
      issuer: String(account.issuer || 'Unknown service').trim(),
      name: String(account.name || 'Unnamed account').trim(),
      secret: cleanSecret(account.secret || ''),
      algorithm: String(account.algorithm || 'SHA1').toUpperCase(),
      digits: Number(account.digits) === 8 ? 8 : 6,
      period: Math.max(1, Number(account.period) || 30),
      category: account.category === 'personal' ? 'personal' : 'work',
      completed: Boolean(account.completed),
      archived: Boolean(account.archived),
      copyCount: Math.max(0, Number(account.copyCount) || 0),
      lastCopiedAt: Math.max(0, Number(account.lastCopiedAt) || 0),
      customValues: account.customValues && typeof account.customValues === 'object' ? account.customValues : {},
      createdAt: Number(account.createdAt) || Date.now()
    };
  }

  function cleanSecret(value) {
    return String(value).toUpperCase().replace(/[^A-Z2-7]/g, '');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function stringHash(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }

  function accountFingerprint(account) {
    return `${cleanSecret(account.secret)}|${account.issuer.trim().toLowerCase()}|${account.name.trim().toLowerCase()}`;
  }

  function openDialog(dialog) {
    dialogs.forEach(item => { if (item !== dialog && item.open) item.close(); });
    backdrop.hidden = false;
    dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function syncBackdrop() {
    backdrop.hidden = !dialogs.some(dialog => dialog.open);
  }

  function toast(message, type = 'success') {
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.textContent = message;
    $('#toastRegion').append(item);
    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(7px)';
      setTimeout(() => item.remove(), 200);
    }, 3200);
  }

  async function copyText(text, label = 'Value') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast(`${label} copied`);
  }

  async function copyAccountCode(account) {
    await copyText(generateTotp(account), 'Code');
    account.copyCount += 1;
    account.lastCopiedAt = Date.now();
    saveState();
    if (!$('#searchSuggestions').hidden) renderSearchSuggestions();
  }

  function randomIndex(length) {
    if (length < 2) return 0;
    const maximum = Math.floor(0x100000000 / length) * length;
    const value = new Uint32Array(1);
    do crypto.getRandomValues(value); while (value[0] >= maximum);
    return value[0] % length;
  }

  function randomItem(items) {
    return items[randomIndex(items.length)];
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swapIndex = randomIndex(index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function selectedPartCount(selector) {
    const value = $(selector).value;
    return value === 'random' ? randomIndex(2) + 1 : Number(value);
  }

  function generateRegionalName(region) {
    const selectedStyle = $('#givenNameStyle').value;
    const styleId = selectedStyle === 'mixed' ? randomItem(['english', 'islamic', 'local']) : selectedStyle;
    const style = givenNameStyles[styleId] || givenNameStyles.local;
    const givenPool = styleId === 'local' ? region.given : style.names;
    const givenNames = shuffled(givenPool).slice(0, selectedPartCount('#givenNameCount'));
    const surnames = shuffled(region.surnames).slice(0, selectedPartCount('#surnameCount'));
    return {
      given: givenNames.join(' '),
      surname: surnames.join(' '),
      name: [...givenNames, ...surnames].join(' '),
      style: style.label,
      region
    };
  }

  function generateSelectedName() {
    if (!nameRegions.length) return;
    const selected = $('#nameRegion').value;
    const region = selected === 'all' ? randomItem(nameRegions) : nameRegions.find(item => item.id === selected) || nameRegions[0];
    const result = generateRegionalName(region);
    currentGeneratedName = result;
    $('#generatedName').textContent = result.name;
    $('#generatedGiven').textContent = result.given;
    $('#generatedSurname').textContent = result.surname;
    $('#generatedRegion').textContent = result.region.region;
    $('#generatedContext').textContent = `${result.style} first name · ${result.region.communities}`;
    ['#copyGeneratedGiven', '#copyGeneratedSurname', '#copyGeneratedName'].forEach(selector => { $(selector).disabled = false; });
  }

  function renderRegionShuffle() {
    const results = shuffled(nameRegions.map(generateRegionalName));
    $('#regionNameGrid').innerHTML = results.map(result => `
      <article class="region-name-item">
        <span class="region-initial">${escapeHtml(result.region.region[0])}</span>
        <div class="region-name-meta"><strong>${escapeHtml(result.name)}</strong><span>${escapeHtml(result.region.region)}</span></div>
        <div class="region-copy-actions">
          <button type="button" data-copy-value="${escapeHtml(result.given)}" data-copy-label="First name(s)" aria-label="Copy first names ${escapeHtml(result.given)}">First</button>
          <button type="button" data-copy-value="${escapeHtml(result.surname)}" data-copy-label="Family name(s)" aria-label="Copy family names ${escapeHtml(result.surname)}">Family</button>
        </div>
      </article>`).join('');
  }

  function initializeNameGenerator() {
    const select = $('#nameRegion');
    if (!select || !nameRegions.length) return;
    select.insertAdjacentHTML('beforeend', nameRegions.map(region => `<option value="${escapeHtml(region.id)}">${escapeHtml(region.region)}</option>`).join(''));
    renderRegionShuffle();
  }

  function base32Decode(secret) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of cleanSecret(secret)) {
      const value = alphabet.indexOf(char);
      if (value < 0) throw new Error('Secret contains invalid Base32 characters.');
      bits += value.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    if (!bytes.length) throw new Error('Secret key is too short.');
    return bytes;
  }

  function base32Encode(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    let output = '';
    for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
    for (let i = 0; i < bits.length; i += 5) {
      output += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
    }
    return output;
  }

  function decodeBase64(value) {
    let normalized = String(value).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    while (normalized.length % 4) normalized += '=';
    const binary = atob(normalized);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  class ProtobufReader {
    constructor(bytes) {
      this.bytes = bytes;
      this.position = 0;
    }

    get done() {
      return this.position >= this.bytes.length;
    }

    readVarint() {
      let result = 0;
      let factor = 1;
      for (let count = 0; count < 10; count++) {
        if (this.done) throw new Error('The migration payload is incomplete.');
        const byte = this.bytes[this.position++];
        result += (byte & 0x7f) * factor;
        if ((byte & 0x80) === 0) return result;
        factor *= 128;
      }
      throw new Error('The migration payload contains an invalid number.');
    }

    readBytes() {
      const length = this.readVarint();
      const end = this.position + length;
      if (end > this.bytes.length) throw new Error('The migration payload is incomplete.');
      const value = this.bytes.slice(this.position, end);
      this.position = end;
      return value;
    }

    skip(wireType) {
      if (wireType === 0) this.readVarint();
      else if (wireType === 1) this.position += 8;
      else if (wireType === 2) this.readBytes();
      else if (wireType === 5) this.position += 4;
      else throw new Error('The migration payload uses an unsupported protobuf field.');
      if (this.position > this.bytes.length) throw new Error('The migration payload is incomplete.');
    }
  }

  function parseMigrationAccount(bytes) {
    const reader = new ProtobufReader(bytes);
    const decoder = new TextDecoder();
    const record = { secret: null, name: '', issuer: '', algorithm: 1, digits: 1, type: 2 };

    while (!reader.done) {
      const tag = reader.readVarint();
      const field = Math.floor(tag / 8);
      const wireType = tag & 7;
      if (field === 1 && wireType === 2) record.secret = reader.readBytes();
      else if (field === 2 && wireType === 2) record.name = decoder.decode(reader.readBytes());
      else if (field === 3 && wireType === 2) record.issuer = decoder.decode(reader.readBytes());
      else if (field === 4 && wireType === 0) record.algorithm = reader.readVarint();
      else if (field === 5 && wireType === 0) record.digits = reader.readVarint();
      else if (field === 6 && wireType === 0) record.type = reader.readVarint();
      else reader.skip(wireType);
    }
    return record;
  }

  function parseMigrationUri(value) {
    const url = new URL(value.trim());
    if (url.protocol !== 'otpauth-migration:') throw new Error('This is not an authenticator migration link.');
    const encodedData = url.searchParams.get('data');
    if (!encodedData) throw new Error('The migration link does not contain account data.');

    const reader = new ProtobufReader(decodeBase64(encodedData));
    const accounts = [];
    let unsupported = 0;

    while (!reader.done) {
      const tag = reader.readVarint();
      const field = Math.floor(tag / 8);
      const wireType = tag & 7;
      if (field !== 1 || wireType !== 2) {
        reader.skip(wireType);
        continue;
      }

      const record = parseMigrationAccount(reader.readBytes());
      const usesTotp = record.type === 0 || record.type === 2;
      const usesSha1 = record.algorithm === 0 || record.algorithm === 1;
      if (!record.secret?.length || !usesTotp || !usesSha1) {
        unsupported++;
        continue;
      }

      accounts.push(normalizeAccount({
        issuer: record.issuer || 'Imported',
        name: record.name || 'Unnamed account',
        secret: base32Encode(record.secret),
        algorithm: 'SHA1',
        digits: record.digits === 2 ? 8 : 6,
        period: 30,
        category: 'work',
        customValues: {}
      }));
    }

    if (!accounts.length && unsupported) {
      throw new Error('This migration contains only HOTP or non-SHA1 accounts, which are not supported yet.');
    }
    if (!accounts.length) throw new Error('No authenticator accounts were found in the migration link.');
    return { accounts, unsupported };
  }

  function leftRotate(value, count) {
    return (value << count) | (value >>> (32 - count));
  }

  function sha1(bytes) {
    const data = [...bytes];
    const bitLength = data.length * 8;
    data.push(0x80);
    while ((data.length % 64) !== 56) data.push(0);
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    for (let shift = 24; shift >= 0; shift -= 8) data.push((high >>> shift) & 0xff);
    for (let shift = 24; shift >= 0; shift -= 8) data.push((low >>> shift) & 0xff);

    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    for (let chunk = 0; chunk < data.length; chunk += 64) {
      const words = new Array(80);
      for (let i = 0; i < 16; i++) {
        const j = chunk + i * 4;
        words[i] = ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) | 0;
      }
      for (let i = 16; i < 80; i++) words[i] = leftRotate(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const temp = (leftRotate(a, 5) + f + e + k + words[i]) | 0;
        e = d; d = c; c = leftRotate(b, 30); b = a; a = temp;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    return [h0, h1, h2, h3, h4].flatMap(word => [word >>> 24, word >>> 16, word >>> 8, word].map(value => value & 0xff));
  }

  function hmacSha1(key, message) {
    let normalizedKey = [...key];
    if (normalizedKey.length > 64) normalizedKey = sha1(normalizedKey);
    normalizedKey = normalizedKey.concat(new Array(64 - normalizedKey.length).fill(0));
    const outer = normalizedKey.map(byte => byte ^ 0x5c);
    const inner = normalizedKey.map(byte => byte ^ 0x36);
    return sha1(outer.concat(sha1(inner.concat(message))));
  }

  function generateTotp(account, timestamp = Date.now()) {
    try {
      const counter = Math.floor(timestamp / 1000 / account.period);
      const message = new Array(8).fill(0);
      let value = counter;
      for (let i = 7; i >= 0; i--) { message[i] = value & 0xff; value = Math.floor(value / 256); }
      const digest = hmacSha1(base32Decode(account.secret), message);
      const offset = digest[digest.length - 1] & 0x0f;
      const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
      return String(binary % (10 ** account.digits)).padStart(account.digits, '0');
    } catch {
      return '—'.repeat(account.digits);
    }
  }

  function formatCode(code) {
    const midpoint = Math.ceil(code.length / 2);
    return `${code.slice(0, midpoint)} ${code.slice(midpoint)}`;
  }

  function renderCounts() {
    $('#accountCount').textContent = state.accounts.filter(account => !account.archived).length;
    $('#archiveCount').textContent = state.accounts.filter(account => account.archived).length;
    const statusAccounts = accountsForStatus();
    $('#allCount').textContent = statusAccounts.length;
    $('#workCount').textContent = statusAccounts.filter(a => a.category === 'work').length;
    $('#personalCount').textContent = statusAccounts.filter(a => a.category === 'personal').length;
  }

  function accountsForStatus() {
    if (state.status === 'archived') return state.accounts.filter(account => account.archived);
    if (state.status === 'done') return state.accounts.filter(account => !account.archived && account.completed);
    if (state.status === 'todo') return state.accounts.filter(account => !account.archived && !account.completed);
    return state.accounts.filter(account => !account.archived);
  }

  function visibleAccounts() {
    const query = state.query.trim().toLowerCase();
    const filtered = accountsForStatus().filter(account => {
      if (state.filter !== 'all' && account.category !== state.filter) return false;
      if (!query) return true;
      const customText = Object.values(account.customValues || {}).join(' ');
      return `${account.issuer} ${account.name} ${customText}`.toLowerCase().includes(query);
    });
    return filtered.sort((a, b) => {
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      if (state.sort === 'issuer') return a.issuer.localeCompare(b.issuer);
      if (state.sort === 'recent') return b.createdAt - a.createdAt;
      return 0;
    });
  }

  function recommendedAccounts() {
    const query = $('#searchInput').value.trim().toLowerCase();
    return state.accounts
      .filter(account => {
        if (account.archived) return false;
        if (!query) return true;
        const customText = Object.values(account.customValues || {}).join(' ');
        return `${account.issuer} ${account.name} ${customText}`.toLowerCase().includes(query);
      })
      .sort((a, b) =>
        b.copyCount - a.copyCount ||
        b.lastCopiedAt - a.lastCopiedAt ||
        b.createdAt - a.createdAt ||
        a.issuer.localeCompare(b.issuer))
      .slice(0, 5);
  }

  function renderSearchSuggestions() {
    const dropdown = $('#searchSuggestions');
    const list = $('#suggestionList');
    const query = $('#searchInput').value.trim();
    const accounts = recommendedAccounts();
    $('#suggestionTitle').textContent = query ? 'Search results' : 'Frequently used';
    list.replaceChildren();

    if (!accounts.length) {
      const empty = document.createElement('div');
      empty.className = 'suggestion-empty';
      empty.textContent = query ? 'No matching accounts found.' : 'Add an account to start building recommendations.';
      list.append(empty);
      dropdown.hidden = false;
      $('#searchInput').setAttribute('aria-expanded', 'true');
      return;
    }

    for (const account of accounts) {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.dataset.accountId = account.id;
      const palette = logoPalettes[stringHash(account.issuer) % logoPalettes.length];
      const usageText = account.copyCount === 1 ? '1 code copy' : `${account.copyCount} code copies`;
      item.innerHTML = `
        <div class="suggestion-logo" style="background:linear-gradient(135deg,${palette[0]},${palette[1]})">${escapeHtml(account.issuer.slice(0, 1).toUpperCase())}</div>
        <div class="suggestion-meta"><strong>${escapeHtml(account.issuer)}</strong><span>${escapeHtml(account.name)} · ${usageText}</span></div>
        <button class="suggestion-copy" type="button" aria-label="Copy code for ${escapeHtml(account.issuer)}"><span class="suggestion-code">${escapeHtml(formatCode(generateTotp(account)))}</span><svg><use href="#i-copy"/></svg></button>`;
      $('.suggestion-copy', item).addEventListener('click', () => copyAccountCode(account));
      list.append(item);
    }
    dropdown.hidden = false;
    $('#searchInput').setAttribute('aria-expanded', 'true');
  }

  function hideSearchSuggestions() {
    $('#searchSuggestions').hidden = true;
    $('#searchInput').setAttribute('aria-expanded', 'false');
  }

  function renderAccounts() {
    renderCounts();
    grid.replaceChildren();
    const accounts = visibleAccounts();
    const archivedView = state.status === 'archived';
    $('#pageTitle').textContent = archivedView ? 'Archived accounts' : state.status === 'done' ? 'Completed accounts' : state.status === 'todo' ? 'Accounts to do' : 'Your accounts';
    $('#pageSubtitle').textContent = archivedView ? 'Stored out of the way, ready whenever you need them.' : 'Secure codes and the details you need, all in one place.';
    $('#statusSelect').value = state.status;
    $('#sortSelect').value = state.sort;
    const emptyHeading = $('#emptyState h2');
    const emptyCopy = $('#emptyState p');
    emptyHeading.textContent = archivedView ? 'Your archive is empty' : state.status === 'done' ? 'Nothing completed yet' : state.status === 'todo' ? 'Everything is done' : 'Your vault is ready';
    emptyCopy.textContent = archivedView ? 'Archived accounts will appear here and can be restored at any time.' : state.status === 'done' ? 'Check an account when the work is finished to see it here.' : state.status === 'todo' ? 'Completed accounts are available from the Show menu.' : 'Add an authenticator account or import an existing backup to get started.';
    $('#emptyState').hidden = accounts.length > 0;
    grid.hidden = accounts.length === 0;

    for (const account of accounts) {
      const card = $('#accountCardTemplate').content.firstElementChild.cloneNode(true);
      card.dataset.accountId = account.id;
      card.draggable = true;
      card.classList.toggle('completed', account.completed);
      card.classList.toggle('archived', account.archived);
      $('.service-meta h2', card).textContent = account.issuer;
      $('.service-meta p', card).textContent = account.name;
      const logo = $('.service-logo', card);
      logo.textContent = account.issuer.slice(0, 1).toUpperCase();
      const palette = logoPalettes[stringHash(account.issuer) % logoPalettes.length];
      logo.style.background = `linear-gradient(135deg, ${palette[0]}, ${palette[1]})`;
      $('.code-value', card).textContent = formatCode(generateTotp(account));
      const doneToggle = $('.done-toggle', card);
      doneToggle.setAttribute('aria-pressed', String(account.completed));
      doneToggle.setAttribute('aria-label', account.completed ? 'Mark as not done' : 'Mark work done');
      $('[data-card-action="archive"]', card).textContent = account.archived ? 'Restore account' : 'Archive account';

      const values = $('.custom-values', card);
      const populatedFields = state.fields.filter(field => String(account.customValues?.[field.id] || '').trim());
      if (!populatedFields.length) {
        values.innerHTML = '<div class="custom-value"><div class="value-text"><span>Custom values</span><strong>None saved</strong></div></div>';
      } else {
        for (const field of populatedFields) {
          const row = document.createElement('div');
          row.className = 'custom-value';
          row.innerHTML = `<div class="value-text"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(account.customValues[field.id])}</strong></div><button class="icon-button" data-copy-value="${escapeHtml(account.customValues[field.id])}" data-copy-label="${escapeHtml(field.label)}" aria-label="Copy ${escapeHtml(field.label)}"><svg><use href="#i-copy"/></svg></button>`;
          values.append(row);
        }
      }
      wireCard(card, account);
      grid.append(card);
    }
    updateTimers();
  }

  function wireCard(card, account) {
    const menu = $('.card-menu', card);
    $('.more-button', card).addEventListener('click', event => {
      event.stopPropagation();
      $$('.card-menu').forEach(other => { if (other !== menu) other.hidden = true; });
      menu.hidden = !menu.hidden;
    });
    $('[data-copy-kind="code"]', card).addEventListener('click', () => copyAccountCode(account));
    $('.done-toggle', card).addEventListener('click', () => {
      account.completed = !account.completed;
      saveState();
      renderAccounts();
      toast(account.completed ? 'Marked as completed' : 'Moved back to to do');
    });
    $$('[data-copy-value]', card).forEach(button => button.addEventListener('click', () => copyText(button.dataset.copyValue, button.dataset.copyLabel)));
    menu.addEventListener('click', event => {
      const action = event.target.closest('[data-card-action]')?.dataset.cardAction;
      if (action === 'edit') openAccountDialog(account);
      if (action === 'copy-uri') copyText(toOtpAuthUri(account), 'OTP link');
      if (action === 'archive') {
        account.archived = !account.archived;
        saveState(); renderAccounts();
        toast(account.archived ? 'Account archived' : 'Account restored');
      }
      if (action === 'delete' && confirm(`Delete ${account.issuer} (${account.name})?`)) {
        state.accounts = state.accounts.filter(item => item.id !== account.id);
        saveState(); renderAccounts(); toast('Account deleted');
      }
      menu.hidden = true;
    });

    card.addEventListener('dragstart', event => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', account.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      const sourceId = event.dataTransfer.getData('text/plain');
      const sourceIndex = state.accounts.findIndex(item => item.id === sourceId);
      const targetIndex = state.accounts.findIndex(item => item.id === account.id);
      card.classList.remove('drag-over');
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
      const [moved] = state.accounts.splice(sourceIndex, 1);
      const adjustedTarget = state.accounts.findIndex(item => item.id === account.id);
      state.accounts.splice(adjustedTarget, 0, moved);
      state.sort = 'manual';
      saveState(); renderAccounts();
      toast('Account order saved');
    });
    card.addEventListener('dragend', () => {
      $$('.account-card').forEach(item => item.classList.remove('dragging', 'drag-over'));
    });
  }

  function updateTimers() {
    const now = Date.now();
    let shortest = 30;
    $$('.account-card').forEach(card => {
      const account = state.accounts.find(item => item.id === card.dataset.accountId);
      if (!account) return;
      const seconds = account.period - (Math.floor(now / 1000) % account.period);
      shortest = Math.min(shortest, seconds);
      $('.timer-ring strong', card).textContent = seconds;
      $('.ring-progress', card).style.strokeDashoffset = String(106.8 * (1 - seconds / account.period));
      $('.code-value', card).textContent = formatCode(generateTotp(account, now));
    });
    $$('.suggestion-item').forEach(item => {
      const account = state.accounts.find(candidate => candidate.id === item.dataset.accountId);
      if (!account) return;
      $('.suggestion-code', item).textContent = formatCode(generateTotp(account, now));
    });
    $('#globalTimer').textContent = `${shortest}s`;
  }

  function renderCustomInputs(values = {}) {
    const container = $('#customValueInputs');
    container.replaceChildren();
    if (!state.fields.length) {
      container.innerHTML = '<p style="margin:0;color:#9199a7;font-size:10px;">No custom fields yet. Add one in settings.</p>';
      return;
    }
    for (const field of state.fields) {
      const label = document.createElement('label');
      label.innerHTML = `${escapeHtml(field.label)}<input data-custom-id="${escapeHtml(field.id)}" value="${escapeHtml(values[field.id] || '')}" placeholder="Enter ${escapeHtml(field.label.toLowerCase())}">`;
      container.append(label);
    }
  }

  function openAccountDialog(account = null) {
    const editing = Boolean(account);
    $('#accountDialogEyebrow').textContent = editing ? 'Edit account' : 'New account';
    $('#accountDialogTitle').textContent = editing ? 'Update authenticator' : 'Add authenticator';
    $('#saveAccountButton').textContent = editing ? 'Save changes' : 'Save account';
    $('#accountId').value = account?.id || '';
    $('#issuerInput').value = account?.issuer || '';
    $('#nameInput').value = account?.name || '';
    $('#secretInput').value = account?.secret || '';
    $('#secretInput').type = 'password';
    $('#categoryInput').value = account?.category || 'work';
    $('#digitsInput').value = String(account?.digits || 6);
    renderCustomInputs(account?.customValues || {});
    openDialog($('#accountDialog'));
    setTimeout(() => $('#issuerInput').focus(), 50);
  }

  function renderFieldDefinitions() {
    const list = $('#fieldDefinitionList');
    list.replaceChildren();
    for (const field of state.fields) addFieldDefinition(field.label, field.id);
  }

  function addFieldDefinition(label = '', id = '') {
    const row = document.createElement('div');
    row.className = 'field-definition';
    row.dataset.fieldId = id;
    row.innerHTML = `<input value="${escapeHtml(label)}" placeholder="Field name, e.g. Team ID" maxlength="40"><button type="button" class="icon-button" aria-label="Remove field"><svg><use href="#i-trash"/></svg></button>`;
    $('.icon-button', row).addEventListener('click', () => row.remove());
    $('#fieldDefinitionList').append(row);
    if (!label) $('input', row).focus();
  }

  function openSettings() {
    renderFieldDefinitions();
    openDialog($('#settingsDialog'));
  }

  function slugifyField(label) {
    const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'field';
    let value = base, index = 2;
    while (state.fields.some(field => field.id === value)) value = `${base}-${index++}`;
    return value;
  }

  function toOtpAuthUri(account) {
    const label = encodeURIComponent(`${account.issuer}:${account.name}`);
    const params = new URLSearchParams({ secret: account.secret, issuer: account.issuer, algorithm: account.algorithm, digits: String(account.digits), period: String(account.period) });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  function parseOtpAuthUri(value) {
    const url = new URL(value.trim());
    if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') throw new Error('Only TOTP otpauth links are supported.');
    const decodedLabel = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const separator = decodedLabel.indexOf(':');
    const labelIssuer = separator >= 0 ? decodedLabel.slice(0, separator) : '';
    const name = separator >= 0 ? decodedLabel.slice(separator + 1) : decodedLabel;
    const issuer = url.searchParams.get('issuer') || labelIssuer || 'Imported';
    const secret = cleanSecret(url.searchParams.get('secret') || '');
    if (!secret) throw new Error(`Missing secret for ${decodedLabel || 'an account'}.`);
    return normalizeAccount({ issuer, name: name || 'Unnamed account', secret, algorithm: url.searchParams.get('algorithm') || 'SHA1', digits: url.searchParams.get('digits') || 6, period: url.searchParams.get('period') || 30, category: 'work', customValues: {} });
  }

  function parseImport(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('Choose a file or paste account data first.');
    if (text.startsWith('{') || text.startsWith('[')) {
      const json = JSON.parse(text);
      const accounts = Array.isArray(json) ? json : json.accounts;
      if (!Array.isArray(accounts)) throw new Error('This JSON file does not contain an accounts list.');
      return { accounts: accounts.map(normalizeAccount), fields: Array.isArray(json.fields) ? json.fields : [], unsupported: 0 };
    }
    const links = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const accounts = [];
    let unsupported = 0;
    for (const link of links) {
      if (link.toLowerCase().startsWith('otpauth-migration://')) {
        const migration = parseMigrationUri(link);
        accounts.push(...migration.accounts);
        unsupported += migration.unsupported;
      } else {
        accounts.push(parseOtpAuthUri(link));
      }
    }
    return { accounts, fields: [], unsupported };
  }

  function importAccounts(raw) {
    const incoming = parseImport(raw);
    const fieldIdMap = new Map();
    for (const importedField of incoming.fields) {
      if (!importedField?.label) continue;
      let local = state.fields.find(field => field.label.toLowerCase() === String(importedField.label).toLowerCase());
      if (!local) {
        local = { id: slugifyField(String(importedField.label)), label: String(importedField.label).trim() };
        state.fields.push(local);
      }
      fieldIdMap.set(importedField.id, local.id);
    }

    let added = 0, merged = 0, skipped = 0;
    const known = new Map(state.accounts.map(account => [accountFingerprint(account), account]));
    for (const rawAccount of incoming.accounts) {
      const account = normalizeAccount(rawAccount);
      if (fieldIdMap.size) {
        account.customValues = Object.fromEntries(Object.entries(account.customValues).map(([key, value]) => [fieldIdMap.get(key) || key, value]));
      }
      const fingerprint = accountFingerprint(account);
      const existing = known.get(fingerprint);
      if (!existing) {
        account.id = uid();
        state.accounts.push(account);
        known.set(fingerprint, account);
        added++;
        continue;
      }
      let changed = false;
      for (const [fieldId, value] of Object.entries(account.customValues || {})) {
        if (value && !existing.customValues?.[fieldId]) {
          existing.customValues = { ...existing.customValues, [fieldId]: value };
          changed = true;
        }
      }
      if (account.copyCount > existing.copyCount) {
        existing.copyCount = account.copyCount;
        changed = true;
      }
      if (account.lastCopiedAt > existing.lastCopiedAt) {
        existing.lastCopiedAt = account.lastCopiedAt;
        changed = true;
      }
      changed ? merged++ : skipped++;
    }
    saveState();
    renderAccounts();
    return { added, merged, skipped, unsupported: incoming.unsupported || 0 };
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function syncNavigation() {
    const archived = state.status === 'archived';
    const generator = state.view === 'generator';
    $('[data-action="show-active"]').classList.toggle('active', !generator && !archived);
    $('[data-action="show-archived"]').classList.toggle('active', !generator && archived);
    $('[data-action="show-generator"]').classList.toggle('active', generator);
    $('#accountTopbar').hidden = generator;
    $('#accountsView').hidden = generator;
    $('#nameGeneratorView').hidden = !generator;
  }

  function resetCategoryFilter() {
    state.filter = 'all';
    $$('.filter-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.filter === 'all'));
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('.card-menu') && !event.target.closest('.more-button')) $$('.card-menu').forEach(menu => menu.hidden = true);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'show-active') {
      state.view = 'accounts';
      state.status = 'active';
      resetCategoryFilter();
      syncNavigation();
      renderAccounts();
    }
    if (action === 'show-archived') {
      state.view = 'accounts';
      state.status = 'archived';
      resetCategoryFilter();
      syncNavigation();
      renderAccounts();
    }
    if (action === 'show-generator') {
      state.view = 'generator';
      syncNavigation();
      if (!currentGeneratedName) generateSelectedName();
    }
    if (action === 'open-account') openAccountDialog();
    if (action === 'open-settings') openSettings();
    if (action === 'open-import') openDialog($('#importDialog'));
    if (action === 'open-export') openDialog($('#exportDialog'));
  });

  $$('.close-dialog').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  dialogs.forEach(dialog => dialog.addEventListener('close', syncBackdrop));
  backdrop.addEventListener('click', () => dialogs.forEach(closeDialog));

  $('#generateName').addEventListener('click', generateSelectedName);
  $('#shuffleAllNames').addEventListener('click', () => {
    renderRegionShuffle();
    generateSelectedName();
    toast('Names shuffled across all ten regions');
  });
  ['#nameRegion', '#givenNameStyle', '#givenNameCount', '#surnameCount'].forEach(selector => $(selector).addEventListener('change', generateSelectedName));
  $('#copyGeneratedGiven').addEventListener('click', () => currentGeneratedName && copyText(currentGeneratedName.given, 'First name(s)'));
  $('#copyGeneratedSurname').addEventListener('click', () => currentGeneratedName && copyText(currentGeneratedName.surname, 'Family name(s)'));
  $('#copyGeneratedName').addEventListener('click', () => currentGeneratedName && copyText(currentGeneratedName.name, 'Full name'));
  $('#regionNameGrid').addEventListener('click', event => {
    const button = event.target.closest('[data-copy-value]');
    if (button) copyText(button.dataset.copyValue, button.dataset.copyLabel);
  });

  $('#accountForm').addEventListener('submit', event => {
    event.preventDefault();
    const secret = cleanSecret($('#secretInput').value);
    try { base32Decode(secret); } catch (error) { toast(error.message, 'error'); return; }
    const customValues = Object.fromEntries($$('[data-custom-id]').map(input => [input.dataset.customId, input.value.trim()]));
    const existing = state.accounts.find(account => account.id === $('#accountId').value);
    const account = normalizeAccount({
      id: existing?.id || uid(), issuer: $('#issuerInput').value, name: $('#nameInput').value, secret,
      category: $('#categoryInput').value, digits: $('#digitsInput').value, period: existing?.period || 30,
      algorithm: existing?.algorithm || 'SHA1', completed: existing?.completed, archived: existing?.archived,
      copyCount: existing?.copyCount, lastCopiedAt: existing?.lastCopiedAt,
      customValues, createdAt: existing?.createdAt || Date.now()
    });
    const duplicate = state.accounts.find(item => item.id !== account.id && accountFingerprint(item) === accountFingerprint(account));
    if (duplicate) { toast('That account already exists in your vault', 'error'); return; }
    if (existing) Object.assign(existing, account); else state.accounts.push(account);
    saveState(); renderAccounts(); closeDialog($('#accountDialog'));
    toast(existing ? 'Account updated' : 'Account added');
  });

  $('#toggleSecret').addEventListener('click', () => {
    const input = $('#secretInput');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#addFieldButton').addEventListener('click', () => addFieldDefinition());
  $('#settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    const seen = new Set();
    const fields = [];
    for (const row of $$('.field-definition')) {
      const label = $('input', row).value.trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      fields.push({ id: row.dataset.fieldId || slugifyField(label), label });
    }
    state.fields = fields;
    saveState(); renderAccounts(); closeDialog($('#settingsDialog')); toast('Custom fields saved');
  });

  $('#searchInput').addEventListener('focus', renderSearchSuggestions);
  $('#searchInput').addEventListener('input', event => {
    state.query = event.target.value;
    renderAccounts();
    renderSearchSuggestions();
  });
  $('#sortSelect').addEventListener('change', event => { state.sort = event.target.value; renderAccounts(); });
  $('#statusSelect').addEventListener('change', event => {
    state.status = event.target.value;
    syncNavigation();
    renderAccounts();
  });
  $$('.filter-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.filter-tab').forEach(item => item.classList.toggle('active', item === tab));
    state.filter = tab.dataset.filter; renderAccounts();
  }));
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#searchInput').focus(); }
    if (event.key === 'Escape' && !$('#searchSuggestions').hidden) {
      hideSearchSuggestions();
      $('#searchInput').blur();
    }
  });
  document.addEventListener('mousedown', event => {
    if (!event.target.closest('.search-wrap')) hideSearchSuggestions();
  });

  const dropZone = $('#dropZone');
  const fileInput = $('#importFile');
  let qrPreviewUrl = '';

  function isQrImageFile(file) {
    return file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
  }

  function clearQrPreview() {
    if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    qrPreviewUrl = '';
    $('#qrImagePreview').removeAttribute('src');
    $('#qrImageResult').hidden = true;
    $('#dropZoneTitle').textContent = 'Choose a file or QR image';
    $('#dropZoneHint').textContent = 'Keynest JSON, OTP links, or a PNG, JPG, or WebP QR code';
  }

  async function decodeQrImage(file) {
    if (typeof window.jsQR !== 'function') throw new Error('The local QR decoder could not be loaded.');

    const bitmap = await createImageBitmap(file);
    try {
      const maximumSide = 2400;
      const scale = Math.min(1, maximumSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      const decoded = window.jsQR(pixels.data, width, height, { inversionAttempts: 'attemptBoth' });
      if (!decoded?.data) throw new Error('No readable QR code was found in that image.');

      const value = decoded.data.trim();
      if (!/^(otpauth|otpauth-migration):\/\//i.test(value) && !value.startsWith('{') && !value.startsWith('[')) {
        throw new Error('The QR code does not contain supported authenticator data.');
      }
      return value;
    } finally {
      bitmap.close();
    }
  }

  function showQrPreview(file, displayName = file.name || 'Pasted QR image') {
    if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    qrPreviewUrl = URL.createObjectURL(file);
    $('#qrImagePreview').src = qrPreviewUrl;
    $('#qrImagePreview').alt = `Preview of ${displayName}`;
    $('#qrImageName').textContent = displayName;
    $('#qrImageResult').hidden = false;
    $('#dropZoneTitle').textContent = 'QR image ready';
    $('#dropZoneHint').textContent = 'The decoded account data is ready to review and import.';
  }

  async function readImportFile(file, displayName = file?.name || 'Pasted QR image') {
    if (!file) return;
    try {
      if (isQrImageFile(file)) {
        $('#dropZoneTitle').textContent = 'Reading QR code…';
        $('#dropZoneHint').textContent = 'Decoding securely on this device.';
        $('#importText').value = await decodeQrImage(file);
        showQrPreview(file, displayName);
        toast('QR code decoded and ready to import');
      } else {
        clearQrPreview();
        $('#importText').value = await file.text();
        toast(`${displayName} is ready to import`);
      }
    } catch (error) {
      clearQrPreview();
      $('#importText').value = '';
      toast(error.message || 'Could not read that file', 'error');
    }
  }
  fileInput.addEventListener('change', () => readImportFile(fileInput.files[0]));
  document.addEventListener('paste', event => {
    if (!$('#importDialog').open) return;
    const imageItem = [...(event.clipboardData?.items || [])]
      .find(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) return;
    const image = imageItem.getAsFile();
    if (!image) return;
    event.preventDefault();
    readImportFile(image, 'Pasted QR image');
  });
  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('dragover'); }));
  dropZone.addEventListener('drop', event => readImportFile(event.dataTransfer.files[0]));
  $('#importForm').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const result = importAccounts($('#importText').value);
      closeDialog($('#importDialog'));
      $('#importForm').reset(); $('#importText').value = '';
      clearQrPreview();
      const unsupported = result.unsupported ? `, ${result.unsupported} unsupported` : '';
      toast(`Import complete: ${result.added} added, ${result.merged} merged, ${result.skipped} skipped${unsupported}`);
    } catch (error) { toast(error.message || 'Import failed', 'error'); }
  });

  $$('[data-export]').forEach(button => button.addEventListener('click', () => {
    if (!state.accounts.length) { toast('Add an account before exporting', 'error'); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    if (button.dataset.export === 'json') {
      downloadFile(`keynest-backup-${stamp}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), fields: state.fields, accounts: state.accounts }, null, 2), 'application/json');
      toast('Keynest backup downloaded');
    } else {
      downloadFile(`keynest-otp-links-${stamp}.txt`, state.accounts.map(toOtpAuthUri).join('\n'), 'text/plain');
      toast('OTP links downloaded');
    }
    closeDialog($('#exportDialog'));
  }));

  loadState();
  initializeNameGenerator();
  syncNavigation();
  renderAccounts();
  setInterval(updateTimers, 1000);
})();
