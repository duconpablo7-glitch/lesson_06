const ARTICLES_URL = '/api/articles';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ITERATIONS = 210000;

const form = document.querySelector('#auth-form');
const menu = document.querySelector('#main-menu');
const nameGroup = document.querySelector('#name-group');
const confirmGroup = document.querySelector('#confirm-group');
const passwordInput = document.querySelector('#password');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
const submitLabel = document.querySelector('#submit-label');
const authView = document.querySelector('#auth-view');
const connectedView = document.querySelector('#connected-view');
const connectedMessage = document.querySelector('#connected-message');

let currentView = 'login';
let currentUser = null;
let articles = [];
let users = [];
let searchAuthors = [];
let articlesLoaded = false;
let searchDataLoaded = false;

function showMessage(text) {
  message.textContent = text;
}

function setView(view) {
  currentView = view;
  const registering = view === 'register';
  document.querySelector('#form-eyebrow').textContent = registering ? 'VOTRE NOUVEAU DÉPART' : 'RAVI DE VOUS REVOIR';
  document.querySelector('#form-title').textContent = registering ? 'Créer un compte' : 'Connexion';
  document.querySelector('#form-intro').textContent = registering
    ? 'Quelques détails et votre espace est prêt.'
    : 'Entrez vos identifiants pour retrouver votre espace.';
  document.querySelector('#switch-prompt').innerHTML = registering
    ? 'Déjà un compte ? <button type="button" data-view="login">Se connecter</button>'
    : 'Nouveau ici ? <button type="button" data-view="register">Créer un compte</button>';
  nameGroup.hidden = !registering;
  confirmGroup.hidden = !registering;
  document.querySelector('#name').required = registering;
  document.querySelector('#confirm-password').required = registering;
  passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
  passwordInput.placeholder = registering ? '8 caractères minimum' : 'Votre mot de passe';
  submitLabel.textContent = registering ? 'Créer mon compte' : 'Se connecter';
  showMessage('');
  form.reset();
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function derivePassword(password, salt, pepper) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: new TextEncoder().encode(`${salt}:${pepper}`),
    iterations: ITERATIONS,
    hash: 'SHA-256',
  }, material, 256);
  return toHex(bits);
}

async function getUsers() {
  return supabaseRequest('user?select=id,name,email,auteur,admin');
}

async function getUserByEmail(email) {
  const rows = await supabaseRequest(`user?select=id,name,email,auteur,admin,sel,poivre,mdp&email=eq.${encodeURIComponent(email)}&limit=1`);
  return rows[0] || null;
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configurez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local, puis redémarrez Vite.');
  }

  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || `Supabase a refusé la requête (${response.status}). Vérifiez les colonnes et les règles RLS de la table user.`);
  }

  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

function normalizedEmail(email) {
  return email.trim().toLocaleLowerCase('fr-FR');
}

function hasRole(value) {
  return value === true || String(value).toLocaleLowerCase('fr-FR') === 'true';
}

function showConnected(user) {
  currentUser = {
    id: user.id,
    name: user.name || '',
    email: user.email,
    auteur: hasRole(user.auteur),
    admin: hasRole(user.admin),
  };
  sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
  authView.hidden = true;
  connectedView.hidden = false;
  document.querySelector('#user-label').textContent = currentUser.email;
  document.querySelector('#user-label').hidden = false;
  document.querySelector('#header-logout').hidden = false;
  document.querySelector('#auth-nav').hidden = true;
  document.querySelector('#admin-nav').hidden = !currentUser.admin;
  connectedMessage.textContent = `Bienvenue${user.name ? `, ${user.name}` : ''}. Vous êtes connecté avec ${user.email}.`;
  openPage('auth');
  renderArticles();
  if (document.querySelector('#admin-page').hidden === false) openPage('admin');
}

function showAuth() {
  currentUser = null;
  document.querySelector('#user-label').hidden = true;
  document.querySelector('#header-logout').hidden = true;
  document.querySelector('#auth-nav').hidden = false;
  document.querySelector('#admin-nav').hidden = true;
  authView.hidden = false;
  connectedView.hidden = true;
  setView('login');
  openPage('auth');
}

function openPage(page) {
  const protectedPage = page === 'write';
  const adminPage = page === 'admin';
  if (adminPage && !currentUser?.admin) page = 'articles';
  document.querySelector('#auth-page').hidden = page !== 'auth';
  document.querySelector('#articles-page').hidden = page !== 'articles';
  document.querySelector('#search-page').hidden = page !== 'search';
  document.querySelector('#write-page').hidden = !protectedPage;
  document.querySelector('#admin-page').hidden = page !== 'admin';
  document.querySelectorAll('[data-page]').forEach((button) => {
    const active = button.dataset.page === page;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  if (protectedPage) {
    const allowed = Boolean(currentUser?.auteur);
    const gate = document.querySelector('#writer-gate');
    gate.hidden = allowed;
    gate.textContent = currentUser
      ? 'Votre compte n’est pas autorisé à publier des articles.'
      : 'Connectez-vous avec un compte auteur pour écrire un article.';
    document.querySelector('#article-form').hidden = !allowed;
  }
  if (page === 'articles') renderArticles();
  if (page === 'search') {
    if (searchDataLoaded) renderSearchResults();
    else loadSearchData();
  }
  if (page === 'admin') loadAdminData();
}

function isPublished(article) {
  return article.publier === true || article.publier === 'true';
}

function renderArticles() {
  const list = document.querySelector('#article-list');
  const message = document.querySelector('#articles-message');
  list.replaceChildren();
  const visibleArticles = articles
    .filter((article) => isPublished(article))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  message.textContent = articles.length === 0
    ? articlesLoaded ? 'Aucun article publié pour le moment.' : 'Chargement des articles…'
    : '';
  if (visibleArticles.length === 0 && articles.length > 0) {
    message.textContent = 'Aucun article publié pour le moment.';
    return;
  }
  if (visibleArticles.length === 0) return;

  visibleArticles.forEach((article) => {
    const entry = document.createElement('article');
    entry.className = 'article-entry';
    const metadata = document.createElement('div');
    metadata.className = 'article-meta';
    const date = document.createElement('time');
    date.dateTime = article.date;
    const parsedDate = new Date(article.date);
    date.textContent = Number.isNaN(parsedDate.getTime())
      ? article.date
      : parsedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    metadata.append(date);
    if (currentUser?.auteur && !isPublished(article)) {
      const draft = document.createElement('span');
      draft.className = 'draft-label';
      draft.textContent = 'Brouillon';
      metadata.append(draft);
    }
    const title = document.createElement('h2');
    title.textContent = article.titre || 'Sans titre';
    const body = document.createElement('p');
    body.className = 'article-body';
    body.textContent = article.article || '';
    entry.append(metadata, title, body);
    list.append(entry);
  });
}

async function loadArticles() {
  const message = document.querySelector('#articles-message');
  try {
    const response = await fetch(ARTICLES_URL);
    if (!response.ok) throw new Error('Impossible de charger les articles.');
    articles = await response.json();
    articlesLoaded = true;
    renderArticles();
  } catch {
    message.textContent = 'Impossible de charger les articles. Vérifiez que json-server est lancé.';
  }
}

async function loadSearchData() {
  const message = document.querySelector('#search-message');
  message.textContent = 'Chargement des articles et des auteurs…';
  try {
    const [allUsers, articlesResponse] = await Promise.all([getUsers(), fetch(ARTICLES_URL)]);
    if (!articlesResponse.ok) throw new Error('Impossible de charger les résultats de recherche.');
    const allArticles = await articlesResponse.json();
    searchAuthors = allUsers
      .filter((user) => hasRole(user.auteur))
      .map(({ name, email }) => ({ name: name || '', email: email || '' }));
    articles = allArticles;
    searchDataLoaded = true;
    renderSearchResults();
  } catch {
    message.textContent = 'Impossible de charger la recherche. Vérifiez que json-server est lancé.';
  }
}

function renderSearchResults() {
  const query = document.querySelector('#site-search').value.trim().toLocaleLowerCase('fr-FR');
  const message = document.querySelector('#search-message');
  const articleResults = document.querySelector('#search-article-results');
  const authorResults = document.querySelector('#search-author-results');
  articleResults.replaceChildren();
  authorResults.replaceChildren();

  if (!query) {
    message.textContent = 'Saisissez un terme pour trouver un article ou un auteur.';
    return;
  }

  const matchingArticles = articles
    .filter((article) => isPublished(article)
      && `${article.titre || ''} ${article.article || ''}`.toLocaleLowerCase('fr-FR').includes(query))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const matchingAuthors = searchAuthors.filter((author) => `${author.name} ${author.email}`
    .toLocaleLowerCase('fr-FR').includes(query));

  message.textContent = matchingArticles.length || matchingAuthors.length
    ? `${matchingArticles.length} article${matchingArticles.length === 1 ? '' : 's'} et ${matchingAuthors.length} auteur${matchingAuthors.length === 1 ? '' : 's'} trouvé${matchingArticles.length + matchingAuthors.length === 1 ? '' : 's'}.`
    : 'Aucun résultat pour cette recherche.';

  matchingArticles.forEach((article) => {
    const result = document.createElement('article');
    result.className = 'search-result';
    const title = document.createElement('h3');
    title.textContent = article.titre || 'Sans titre';
    const date = document.createElement('time');
    date.dateTime = article.date || '';
    const parsedDate = new Date(article.date);
    date.textContent = Number.isNaN(parsedDate.getTime())
      ? article.date || ''
      : parsedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const excerpt = document.createElement('p');
    excerpt.textContent = article.article || '';
    result.append(title, date, excerpt);
    articleResults.append(result);
  });

  matchingAuthors.forEach((author) => {
    const result = document.createElement('article');
    result.className = 'search-result search-author';
    const name = document.createElement('h3');
    name.textContent = author.name || author.email;
    const email = document.createElement('a');
    email.href = `mailto:${author.email}`;
    email.textContent = author.email;
    result.append(name, email);
    authorResults.append(result);
  });
}

async function loadAdminData() {
  const gate = document.querySelector('#admin-gate');
  const content = document.querySelector('#admin-content');
  if (!currentUser?.admin) {
    content.hidden = true;
    gate.hidden = false;
    gate.textContent = 'Connectez-vous avec un compte administrateur pour accéder à cette page.';
    return;
  }

  gate.hidden = true;
  content.hidden = false;
  const message = document.querySelector('#admin-message');
  message.textContent = 'Chargement…';
  try {
    const [allUsers, articlesResponse] = await Promise.all([getUsers(), fetch(ARTICLES_URL)]);
    if (!articlesResponse.ok) throw new Error('Impossible de charger les données administratives.');
    users = allUsers;
    articles = await articlesResponse.json();
    renderAdminUsers();
    renderAdminArticles();
    message.textContent = '';
  } catch (error) {
    message.textContent = error instanceof TypeError
      ? 'Serveur indisponible. Vérifiez la configuration Supabase et que json-server est lancé.'
      : error.message;
  }
}

function appendCell(row, text) {
  const cell = document.createElement('td');
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function createAdminAction(label, className, handler, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `table-action ${className}`;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', handler);
  return button;
}

function renderAdminUsers() {
  const body = document.querySelector('#users-table-body');
  body.replaceChildren();
  document.querySelector('#users-count').textContent = String(users.length);
  document.querySelector('#users-empty').hidden = users.length > 0;

  users.forEach((user) => {
    const row = document.createElement('tr');
    appendCell(row, user.name || '—');
    appendCell(row, user.email || '—');
    appendCell(row, hasRole(user.auteur) ? 'Oui' : 'Non');
    const adminCell = document.createElement('td');
    const adminCheckbox = document.createElement('input');
    adminCheckbox.className = 'admin-checkbox';
    adminCheckbox.type = 'checkbox';
    adminCheckbox.checked = hasRole(user.admin);
    adminCheckbox.disabled = user.id === currentUser.id;
    adminCheckbox.setAttribute('aria-label', `Droits administrateur pour ${user.name || user.email}`);
    if (adminCheckbox.disabled) adminCheckbox.title = 'Vous ne pouvez pas modifier vos propres droits administrateur.';
    adminCheckbox.addEventListener('change', () => updateAdminPermission(user, adminCheckbox));
    adminCell.append(adminCheckbox);
    row.append(adminCell);
    const actions = document.createElement('td');
    actions.append(createAdminAction('Supprimer', 'delete-action', () => deleteUser(user), user.id === currentUser.id));
    if (user.id === currentUser.id) actions.title = 'Vous ne pouvez pas supprimer votre propre compte.';
    row.append(actions);
    body.append(row);
  });
}

async function updateAdminPermission(user, checkbox) {
  if (!currentUser?.admin || user.id === currentUser.id) return;
  const requestedRole = checkbox.checked;
  checkbox.disabled = true;
  const updated = await adminRequest(() => supabaseRequest(`user?id=eq.${encodeURIComponent(user.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ admin: requestedRole }),
  }), requestedRole ? 'Droits administrateur activés.' : 'Droits administrateur retirés.');
  if (!updated) {
    checkbox.checked = !requestedRole;
    checkbox.disabled = false;
  }
}

function renderAdminArticles() {
  const body = document.querySelector('#admin-articles-table-body');
  body.replaceChildren();
  document.querySelector('#admin-articles-count').textContent = String(articles.length);
  document.querySelector('#admin-articles-empty').hidden = articles.length > 0;

  [...articles].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()).forEach((article) => {
    const row = document.createElement('tr');
    appendCell(row, article.titre || 'Sans titre');
    appendCell(row, article.date || '—');
    appendCell(row, isPublished(article) ? 'Publié' : 'Brouillon');
    const actions = document.createElement('td');
    if (!isPublished(article)) {
      actions.append(createAdminAction('Publier', 'publish-action', () => publishArticle(article)));
    }
    actions.append(createAdminAction('Supprimer', 'delete-action', () => deleteArticle(article)));
    row.append(actions);
    body.append(row);
  });
}

async function adminRequest(action, successMessage) {
  const message = document.querySelector('#admin-message');
  if (!currentUser?.admin) {
    message.textContent = 'Accès administrateur requis.';
    return false;
  }
  try {
    await action();
    await loadAdminData();
    message.textContent = successMessage;
    return true;
  } catch (error) {
    message.textContent = error instanceof TypeError
      ? 'Serveur indisponible. Vérifiez Supabase et que json-server est lancé.'
      : error.message;
    return false;
  }
}

async function deleteUser(user) {
  if (user.id === currentUser?.id) return;
  if (!window.confirm(`Supprimer le compte de ${user.name || user.email} ?`)) return;
  await adminRequest(() => supabaseRequest(`user?id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' }), 'Utilisateur supprimé.');
}

async function publishArticle(article) {
  await adminRequest(async () => {
    const response = await fetch(`${ARTICLES_URL}/${encodeURIComponent(article.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publier: true }),
    });
    if (!response.ok) throw new Error('La modification a échoué.');
  }, 'Article publié.');
}

async function deleteArticle(article) {
  if (!window.confirm(`Supprimer l’article « ${article.titre || 'Sans titre'} » ?`)) return;
  await adminRequest(async () => {
    const response = await fetch(`${ARTICLES_URL}/${encodeURIComponent(article.id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('La modification a échoué.');
  }, 'Article supprimé.');
}

menu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (button) openPage(button.dataset.page);
});

document.querySelector('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  renderSearchResults();
});

document.querySelector('#site-search').addEventListener('input', renderSearchResults);

document.querySelector('#switch-prompt').addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  if (button) setView(button.dataset.view);
});

document.querySelector('#logout-button').addEventListener('click', () => {
  sessionStorage.removeItem('currentUser');
  showAuth();
});

document.querySelector('#header-logout').addEventListener('click', () => {
  sessionStorage.removeItem('currentUser');
  showAuth();
});

document.querySelector('#article-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#article-form-message');
  if (!currentUser?.auteur || !form.reportValidity()) return;

  const data = new FormData(form);
  const submit = document.querySelector('#article-submit');
  submit.disabled = true;
  message.textContent = '';
  try {
    const response = await fetch(ARTICLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titre: String(data.get('titre')).trim(),
        article: String(data.get('article')).trim(),
        date: data.get('date'),
        publier: data.get('publier') === 'true',
      }),
    });
    if (!response.ok) throw new Error('L’enregistrement de l’article a échoué.');
    const createdArticle = await response.json();
    articles.push(createdArticle);
    form.reset();
    document.querySelector('#article-date').value = new Date().toLocaleDateString('sv-SE');
    message.textContent = 'Article enregistré.';
    message.classList.add('is-success');
    renderArticles();
  } catch (error) {
    message.textContent = error instanceof TypeError
      ? 'Serveur indisponible. Lancez json-server puis réessayez.'
      : error.message;
    message.classList.remove('is-success');
  } finally {
    submit.disabled = false;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const email = normalizedEmail(String(data.get('email') || ''));
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('confirm-password') || '');

  if (currentView === 'register' && password !== confirmation) {
    showMessage('Les deux mots de passe ne correspondent pas.');
    document.querySelector('#confirm-password').focus();
    return;
  }

  submitButton.disabled = true;
  submitLabel.textContent = 'Un instant…';

  try {
    const existingUser = await getUserByEmail(email);

    if (currentView === 'register') {
      if (existingUser) {
        showMessage('Un compte existe déjà avec cette adresse e-mail.');
        return;
      }

      const salt = randomSalt();
      const pepper = randomSalt();
      const passwordHash = await derivePassword(password, salt, pepper);
      const createdUsers = await supabaseRequest('user', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name, email, auteur: false, poivre: pepper, sel: salt, mdp: passwordHash }),
      });
      const createdUser = createdUsers[0];
      showConnected(createdUser);
      return;
    }

    if (!existingUser) {
      showMessage('Adresse e-mail ou mot de passe incorrect.');
      return;
    }

    const submittedHash = await derivePassword(password, existingUser.sel, existingUser.poivre);
    if (submittedHash !== existingUser.mdp) {
      showMessage('Adresse e-mail ou mot de passe incorrect.');
      return;
    }

    showConnected(existingUser);
  } catch (error) {
    showMessage(error instanceof TypeError
      ? 'Serveur indisponible. Lancez json-server puis réessayez.'
      : error.message || 'Une erreur est survenue. Réessayez.');
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = currentView === 'register' ? 'Créer mon compte' : 'Se connecter';
  }
});

try {
  const savedUser = JSON.parse(sessionStorage.getItem('currentUser'));
  if (savedUser?.email) {
    getUserByEmail(normalizedEmail(savedUser.email)).then((latestUser) => {
      if (latestUser) showConnected(latestUser);
      else showAuth();
    }).catch(() => showAuth());
  } else {
    setView('login');
  }
} catch {
  sessionStorage.removeItem('currentUser');
  setView('login');
}

document.querySelector('#article-date').value = new Date().toLocaleDateString('sv-SE');
loadArticles();