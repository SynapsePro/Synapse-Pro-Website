(() => {
  "use strict";

  const config = window.SYNAPSEPRO_COMMAND_CENTER || {};
  const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";

  const SOURCE_META = {
    github: { label: "GitHub", short: "GH", color: "#24292f", bg: "#eef0f3" },
    reddit: { label: "Reddit", short: "R", color: "#e64a19", bg: "#fff0ea" },
    ankiweb: { label: "AnkiWeb", short: "AW", color: "#2176d2", bg: "#eaf3ff" },
    gmail: { label: "Support", short: "Mail", color: "#c43b35", bg: "#ffeded" },
    website: { label: "Website", short: "Web", color: "#7554d8", bg: "#f0ecff" },
    other: { label: "Andere", short: "?", color: "#687080", bg: "#f0f2f5" },
  };

  const VIEW_META = {
    today: { eyebrow: "Übersicht", title: greeting() },
    inbox: { eyebrow: "Alle Plattformen", title: "Zentrale Inbox" },
    actions: { eyebrow: "Kontrolle", title: "Freigaben" },
    analytics: { eyebrow: "Signale", title: "Analytics" },
    automations: { eyebrow: "Make.com", title: "Automationen" },
  };

  const state = {
    supabase: null,
    session: null,
    user: null,
    currentView: "today",
    inboxFilter: "all",
    searchTerm: "",
    realtimeChannel: null,
    data: {
      inbox: [],
      actions: [],
      briefings: [],
      runs: [],
      onboarding: [],
    },
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheDom();
    bindStaticEvents();

    if (demoMode) {
      state.user = { email: "demo@synapse-pro.de", id: "demo-user" };
      state.data = demoData();
      enterApp();
      dom.demoBadge.classList.remove("is-hidden");
      dom.connectionLabel.textContent = "Demo-Daten";
      return;
    }

    if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) {
      setAuthStatus("Supabase konnte nicht initialisiert werden. Prüfe die Konfiguration.", true);
      return;
    }

    state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    initializeSession();
  }

  function cacheDom() {
    [
      "auth-shell", "app-shell", "login-form", "login-email", "login-password", "auth-status",
      "logout-button", "refresh-button", "loading-bar", "global-message",
      "page-eyebrow", "page-title", "user-avatar", "connection-label", "demo-badge",
      "nav-inbox-count", "nav-action-count", "today-kpis", "briefing-headline",
      "briefing-date", "briefing-summary", "briefing-priorities", "alert-count",
      "alert-list", "today-inbox-list", "source-summary", "inbox-search",
      "inbox-filters", "inbox-list", "action-list", "analytics-kpis",
      "language-bars", "role-bars", "automation-status-grid", "automation-runs",
      "drawer-backdrop", "detail-drawer", "drawer-close", "drawer-content", "toast-region",
    ].forEach((id) => {
      dom[toCamel(id)] = document.getElementById(id);
    });
  }

  function bindStaticEvents() {
    dom.loginForm.addEventListener("submit", handleLogin);
    dom.logoutButton.addEventListener("click", handleLogout);
    dom.refreshButton.addEventListener("click", () => loadData(true));
    dom.inboxSearch.addEventListener("input", (event) => {
      state.searchTerm = event.target.value.trim().toLowerCase();
      renderInbox();
    });
    dom.inboxFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      state.inboxFilter = button.dataset.filter;
      dom.inboxFilters.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      renderInbox();
    });

    document.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-nav]");
      if (nav) navigate(nav.dataset.nav);

      const inboxTarget = event.target.closest("[data-inbox-id]");
      if (inboxTarget) openInboxDetail(inboxTarget.dataset.inboxId);

      const actionButton = event.target.closest("[data-action-decision]");
      if (actionButton) handleActionDecision(actionButton);
    });

    dom.drawerClose.addEventListener("click", closeDrawer);
    dom.drawerBackdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDrawer();
    });
  }

  async function initializeSession() {
    setAuthStatus("Sitzung wird geprüft …");
    const { data, error } = await state.supabase.auth.getSession();
    if (error) {
      setAuthStatus(error.message, true);
      return;
    }
    if (data.session) {
      await acceptSession(data.session);
    } else {
      setAuthStatus("");
    }

    state.supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.access_token !== state.session?.access_token) {
        window.setTimeout(() => acceptSession(session), 0);
      }
    });
  }

  async function acceptSession(session) {
    state.session = session;
    state.user = session.user;
    setAuthStatus("Zugriff wird geprüft …");

    const { data, error } = await state.supabase
      .from("admin_users")
      .select("user_id, display_name")
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (error) {
      setAuthStatus(`Command-Center-Schema noch nicht verfügbar: ${error.message}`, true);
      return;
    }
    if (!data) {
      setAuthStatus("Dieses Konto ist angemeldet, aber noch nicht als Command-Center-Admin freigeschaltet.", true);
      return;
    }

    enterApp();
    await loadData();
    setupRealtime();
  }

  async function handleLogin(event) {
    event.preventDefault();
    const email = dom.loginEmail.value.trim();
    const password = dom.loginPassword.value;
    if (!email || !password || !state.supabase) return;

    const button = dom.loginForm.querySelector("button[type='submit']");
    button.disabled = true;
    setAuthStatus("Anmeldung läuft …");
    const { error } = await state.supabase.auth.signInWithPassword({ email, password });
    button.disabled = false;
    if (error) {
      const message = error.message === "Invalid login credentials"
        ? "E-Mail-Adresse oder Passwort ist falsch."
        : error.message;
      setAuthStatus(message, true);
      return;
    }
    setAuthStatus("Erfolgreich angemeldet.");
  }

  async function handleLogout() {
    if (demoMode) {
      window.location.href = window.location.pathname;
      return;
    }
    if (state.realtimeChannel) await state.supabase.removeChannel(state.realtimeChannel);
    await state.supabase.auth.signOut();
    state.session = null;
    state.user = null;
    dom.appShell.classList.add("is-hidden");
    dom.authShell.classList.remove("is-hidden");
    setAuthStatus("Abgemeldet.");
  }

  function enterApp() {
    dom.authShell.classList.add("is-hidden");
    dom.appShell.classList.remove("is-hidden");
    const email = state.user?.email || "Admin";
    dom.userAvatar.textContent = email.slice(0, 1).toUpperCase();
    VIEW_META.today.title = greeting();
    navigate(location.hash.replace("#", "") || "today", false);
    if (demoMode) renderAll();
  }

  async function loadData(showToast = false) {
    if (demoMode) {
      renderAll();
      if (showToast) toast("Demo-Daten aktualisiert.");
      return;
    }
    if (!state.supabase || !state.session) return;

    setLoading(true);
    clearGlobalMessage();
    try {
      const [inboxResult, actionsResult, briefingResult, runsResult, onboardingResult] = await Promise.all([
        state.supabase
          .from("inbox_items")
          .select("*, ai_analyses(*)")
          .order("ingested_at", { ascending: false })
          .limit(150),
        state.supabase
          .from("action_queue")
          .select("*, inbox_items(source, title, external_url)")
          .order("requested_at", { ascending: false })
          .limit(100),
        state.supabase
          .from("daily_briefings")
          .select("*")
          .order("briefing_date", { ascending: false })
          .limit(7),
        state.supabase
          .from("automation_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(80),
        state.supabase
          .from("onboarding_events")
          .select("created_at, lang, role, source, theme_number")
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

      const results = [inboxResult, actionsResult, briefingResult, runsResult];
      const failed = results.find((result) => result.error);
      if (failed) throw failed.error;

      state.data.inbox = inboxResult.data || [];
      state.data.actions = actionsResult.data || [];
      state.data.briefings = briefingResult.data || [];
      state.data.runs = runsResult.data || [];
      state.data.onboarding = onboardingResult.error ? [] : (onboardingResult.data || []);
      renderAll();
      dom.connectionLabel.textContent = "Live verbunden";
      if (showToast) toast("Daten aktualisiert.");
    } catch (error) {
      showGlobalMessage(`Daten konnten nicht geladen werden: ${error.message || String(error)}`);
      dom.connectionLabel.textContent = "Fehler";
    } finally {
      setLoading(false);
    }
  }

  function setupRealtime() {
    if (!state.supabase || demoMode || state.realtimeChannel) return;
    state.realtimeChannel = state.supabase
      .channel("command-center-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox_items" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "action_queue" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_runs" }, () => loadData())
      .subscribe((status) => {
        dom.connectionLabel.textContent = status === "SUBSCRIBED" ? "Live verbunden" : "Verbinde …";
      });
  }

  function navigate(view, updateHash = true) {
    if (!VIEW_META[view]) view = "today";
    state.currentView = view;
    document.querySelectorAll("[data-view]").forEach((section) => {
      section.classList.toggle("is-active", section.dataset.view === view);
    });
    document.querySelectorAll("[data-nav]").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.nav === view);
    });
    dom.pageEyebrow.textContent = VIEW_META[view].eyebrow;
    dom.pageTitle.textContent = VIEW_META[view].title;
    if (updateHash) history.replaceState(null, "", `#${view}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAll() {
    renderNavigationCounts();
    renderToday();
    renderInbox();
    renderActions();
    renderAnalytics();
    renderAutomations();
  }

  function renderNavigationCounts() {
    const newItems = state.data.inbox.filter((item) => item.status === "new").length;
    const pending = state.data.actions.filter((action) => action.status === "pending" || action.status === "dispatch_failed").length;
    dom.navInboxCount.textContent = String(newItems);
    dom.navActionCount.textContent = String(pending);
  }

  function renderToday() {
    const inbox = state.data.inbox;
    const actions = state.data.actions;
    const onboarding24h = state.data.onboarding.filter((item) => isWithinHours(item.created_at, 24)).length;
    const critical = inbox.filter((item) => effectivePriority(item) === "critical").length;
    const pending = actions.filter((action) => action.status === "pending" || action.status === "dispatch_failed").length;

    renderKpis(dom.todayKpis, [
      { label: "Neue Eingänge", value: inbox.filter((item) => item.status === "new").length, note: "noch nicht bearbeitet", tone: "blue" },
      { label: "Offene Freigaben", value: pending, note: "wartet auf Entscheidung", tone: "orange" },
      { label: "Kritische Signale", value: critical, note: "sofort prüfen", tone: critical ? "red" : "green" },
      { label: "Neue Nutzer · 24 h", value: onboarding24h, note: "Onboarding-Ereignisse", tone: "green" },
    ]);

    const briefing = state.data.briefings[0];
    dom.briefingHeadline.textContent = briefing?.headline || "Heute im Fokus";
    dom.briefingSummary.textContent = briefing?.summary || "Noch kein Tagesbriefing vorhanden. Nach dem ersten vollständigen Make-Lauf erstellt die AI hier eine priorisierte Zusammenfassung.";
    dom.briefingDate.textContent = briefing?.briefing_date ? formatDate(briefing.briefing_date, { day: "2-digit", month: "short" }) : "Heute";
    renderPriorities(normalizeList(briefing?.priorities));

    const alerts = normalizeList(briefing?.alerts);
    const fallbackAlerts = buildFallbackAlerts();
    renderAlerts(alerts.length ? alerts : fallbackAlerts);

    clear(dom.todayInboxList);
    inbox.slice(0, 6).forEach((item) => dom.todayInboxList.appendChild(createFeedItem(item)));
    if (!inbox.length) dom.todayInboxList.appendChild(emptyState("Noch keine Eingänge", "Die Collector-Szenarien haben noch keine Datensätze angelegt."));

    renderSourceSummary();
  }

  function renderPriorities(priorities) {
    clear(dom.briefingPriorities);
    const list = priorities.slice(0, 4);
    if (!list.length) {
      dom.briefingPriorities.appendChild(emptyState("Noch keine Prioritäten", "Die AI ergänzt diese Liste im täglichen Briefing."));
      return;
    }
    list.forEach((priority, index) => {
      const item = el("div", "priority-item");
      item.appendChild(el("span", "priority-number", String(index + 1)));
      const copy = el("div");
      copy.appendChild(el("strong", "", typeof priority === "string" ? priority : (priority.title || priority.label || "Priorität")));
      const detail = typeof priority === "object" ? (priority.detail || priority.reason || "") : "";
      if (detail) copy.appendChild(el("p", "", detail));
      item.appendChild(copy);
      dom.briefingPriorities.appendChild(item);
    });
  }

  function renderAlerts(alerts) {
    clear(dom.alertList);
    dom.alertCount.textContent = String(alerts.length);
    if (!alerts.length) {
      dom.alertList.appendChild(emptyState("Alles ruhig", "Keine kritischen Signale erkannt."));
      return;
    }
    alerts.slice(0, 5).forEach((alert) => {
      const item = el("div", "compact-item");
      item.appendChild(el("span", "signal-dot"));
      const copy = el("div");
      copy.appendChild(el("strong", "", typeof alert === "string" ? alert : (alert.title || "Hinweis")));
      const detail = typeof alert === "object" ? (alert.detail || alert.message || "") : "";
      if (detail) copy.appendChild(el("p", "", detail));
      item.appendChild(copy);
      dom.alertList.appendChild(item);
    });
  }

  function renderSourceSummary() {
    clear(dom.sourceSummary);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const counts = {};
    state.data.inbox.forEach((item) => {
      const time = Date.parse(item.ingested_at || item.published_at || 0);
      if (time >= since) counts[item.source] = (counts[item.source] || 0) + 1;
    });
    const sources = Object.entries(SOURCE_META).filter(([key]) => key !== "other");
    sources.forEach(([key, meta]) => {
      const row = el("div", "source-row");
      row.appendChild(sourceIcon(key));
      const copy = el("div");
      copy.appendChild(el("strong", "", meta.label));
      copy.appendChild(el("small", "", counts[key] ? "Neue Aktivität" : "Keine neuen Einträge"));
      row.append(copy, el("span", "source-value", String(counts[key] || 0)));
      dom.sourceSummary.appendChild(row);
    });
  }

  function renderInbox() {
    clear(dom.inboxList);
    let items = state.data.inbox.slice();
    if (state.inboxFilter !== "all") {
      items = items.filter((item) => effectiveCategory(item) === state.inboxFilter);
    }
    if (state.searchTerm) {
      items = items.filter((item) => {
        const analysis = analysisOf(item);
        return [item.title, item.content, item.author_handle, analysis?.summary_de, effectiveCategory(item), item.source]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(state.searchTerm);
      });
    }

    if (!items.length) {
      dom.inboxList.appendChild(emptyState("Keine passenden Einträge", "Passe Suche oder Filter an."));
      return;
    }
    items.forEach((item) => dom.inboxList.appendChild(createInboxCard(item)));
  }

  function createInboxCard(item) {
    const card = el("article", "inbox-card");
    card.dataset.inboxId = item.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.appendChild(sourceIcon(item.source));

    const body = el("div");
    const analysis = analysisOf(item);
    body.appendChild(el("h3", "", item.title || analysis?.summary_de || categoryLabel(effectiveCategory(item))));
    body.appendChild(el("p", "", truncate(analysis?.summary_de || item.content || "Kein Text", 220)));
    const meta = el("div", "card-meta");
    meta.appendChild(metaPill(categoryLabel(effectiveCategory(item)), "is-category"));
    const priority = effectivePriority(item);
    if (priority === "high" || priority === "critical") meta.appendChild(metaPill(priorityLabel(priority), `is-${priority}`));
    if (item.author_handle) meta.appendChild(metaPill(`@${item.author_handle.replace(/^@/, "")}`));
    body.appendChild(meta);
    card.appendChild(body);
    card.appendChild(el("time", "inbox-time", relativeTime(item.published_at || item.ingested_at)));
    return card;
  }

  function createFeedItem(item) {
    const row = el("div", "feed-item");
    row.dataset.inboxId = item.id;
    row.appendChild(sourceIcon(item.source));
    const copy = el("div");
    copy.appendChild(el("strong", "", item.title || analysisOf(item)?.summary_de || categoryLabel(effectiveCategory(item))));
    copy.appendChild(el("p", "", truncate(analysisOf(item)?.summary_de || item.content, 110)));
    row.append(copy, el("span", "feed-meta", relativeTime(item.published_at || item.ingested_at)));
    return row;
  }

  function openInboxDetail(id) {
    const item = state.data.inbox.find((entry) => String(entry.id) === String(id));
    if (!item) return;
    const analysis = analysisOf(item);
    clear(dom.drawerContent);

    const title = el("h2", "drawer-title", item.title || analysis?.summary_de || "Inbox-Eintrag");
    title.id = "drawer-title";
    dom.drawerContent.appendChild(title);
    const meta = el("div", "drawer-meta");
    meta.append(metaPill(sourceMeta(item.source).label, "is-category"));
    meta.append(metaPill(categoryLabel(effectiveCategory(item))));
    meta.append(metaPill(priorityLabel(effectivePriority(item)), effectivePriority(item) === "critical" ? "is-critical" : ""));
    dom.drawerContent.appendChild(meta);

    dom.drawerContent.appendChild(drawerSection("Original", item.content || "Kein Inhalt gespeichert."));
    if (analysis?.summary_de) dom.drawerContent.appendChild(drawerSection("AI-Zusammenfassung", analysis.summary_de));
    if (analysis?.translated_text && analysis.translated_text !== item.content) dom.drawerContent.appendChild(drawerSection("Übersetzung", analysis.translated_text));
    if (analysis?.suggested_reply) dom.drawerContent.appendChild(drawerSection("Antwortvorschlag", analysis.suggested_reply));

    if (item.external_url) {
      const link = el("a", "external-link", "Auf Plattform öffnen ↗");
      link.href = item.external_url;
      link.target = "_blank";
      link.rel = "noopener";
      dom.drawerContent.appendChild(link);
    }

    dom.drawerBackdrop.classList.remove("is-hidden");
    dom.detailDrawer.classList.add("is-open");
    dom.detailDrawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    dom.drawerBackdrop.classList.add("is-hidden");
    dom.detailDrawer.classList.remove("is-open");
    dom.detailDrawer.setAttribute("aria-hidden", "true");
  }

  function renderActions() {
    clear(dom.actionList);
    const actionable = state.data.actions.filter((action) => ["pending", "dispatch_failed", "approved", "completed"].includes(action.status));
    if (!actionable.length) {
      dom.actionList.appendChild(emptyState("Keine offenen Freigaben", "Neue Antwort- oder Veröffentlichungsentwürfe erscheinen automatisch hier."));
      return;
    }
    actionable.forEach((action) => dom.actionList.appendChild(createActionCard(action)));
  }

  function createActionCard(action) {
    const card = el("article", "action-card");
    card.dataset.actionId = action.id;
    const head = el("div", "action-head");
    const copy = el("div");
    copy.appendChild(el("h3", "", actionTypeLabel(action.action_type)));
    const source = action.inbox_items?.source ? sourceMeta(action.inbox_items.source).label : (action.destination || "Externe Aktion");
    copy.appendChild(el("p", "action-source", `${source}${action.inbox_items?.title ? ` · ${action.inbox_items.title}` : ""}`));
    head.append(copy, statusBadge(action.status));
    card.appendChild(head);

    const textarea = el("textarea", "action-draft");
    textarea.value = action.draft_text || "";
    textarea.setAttribute("aria-label", "Entwurf bearbeiten");
    textarea.disabled = !["pending", "dispatch_failed"].includes(action.status);
    card.appendChild(textarea);

    if (action.last_error) card.appendChild(el("p", "action-source", `Letzter Fehler: ${action.last_error}`));

    if (["pending", "dispatch_failed"].includes(action.status)) {
      const buttons = el("div", "action-buttons");
      if (action.status === "pending") {
        const decline = button("Ablehnen", "button button-danger-soft");
        decline.dataset.actionDecision = "decline";
        decline.dataset.actionId = action.id;
        buttons.appendChild(decline);
      }
      const approve = button(action.status === "dispatch_failed" ? "Erneut senden" : "Freigeben & senden", "button button-primary");
      approve.dataset.actionDecision = action.status === "dispatch_failed" ? "retry" : "approve";
      approve.dataset.actionId = action.id;
      buttons.appendChild(approve);
      card.appendChild(buttons);
    }
    return card;
  }

  async function handleActionDecision(buttonElement) {
    const actionId = buttonElement.dataset.actionId;
    const decision = buttonElement.dataset.actionDecision;
    const card = buttonElement.closest("[data-action-id]");
    const draftText = card?.querySelector("textarea")?.value || "";
    buttonElement.disabled = true;

    if (demoMode) {
      const action = state.data.actions.find((entry) => String(entry.id) === String(actionId));
      if (action) {
        action.draft_text = draftText;
        action.status = decision === "decline" ? "declined" : "approved";
      }
      renderAll();
      toast(decision === "decline" ? "Demo-Aktion abgelehnt." : "Demo-Aktion freigegeben.");
      return;
    }

    try {
      const { data, error } = await state.supabase.functions.invoke(config.dispatchFunction || "dispatch-action", {
        body: { actionId, decision, draftText },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast(decision === "decline" ? "Aktion abgelehnt." : "Aktion sicher an Make übergeben.");
      await loadData();
    } catch (error) {
      toast(error.message || "Aktion fehlgeschlagen.", true);
      buttonElement.disabled = false;
    }
  }

  function renderAnalytics() {
    const onboarding = state.data.onboarding;
    const historical = Number(config.historicalOnboardingCount || 0);
    const total = onboarding.length + historical;
    const last24h = onboarding.filter((item) => isWithinHours(item.created_at, 24)).length;
    const last7d = onboarding.filter((item) => isWithinHours(item.created_at, 168)).length;
    const feedback7d = state.data.inbox.filter((item) => isWithinHours(item.ingested_at, 168)).length;
    renderKpis(dom.analyticsKpis, [
      { label: "Onboardings gesamt", value: total, note: historical ? `inkl. ${formatNumber(historical)} historischer Nutzer` : "gemessene Ereignisse", tone: "blue" },
      { label: "Neue Nutzer · 24 h", value: last24h, note: "echte Zeitstempel", tone: "green" },
      { label: "Neue Nutzer · 7 Tage", value: last7d, note: "rollierendes Fenster", tone: "green" },
      { label: "Feedback · 7 Tage", value: feedback7d, note: "alle Plattformen", tone: "orange" },
    ]);
    renderBars(dom.languageBars, distribution(onboarding, "lang"));
    renderBars(dom.roleBars, distribution(onboarding, "role"));
  }

  function renderKpis(container, items) {
    clear(container);
    items.forEach((item) => {
      const card = el("article", "kpi-card");
      card.dataset.tone = item.tone || "blue";
      card.appendChild(el("span", "kpi-label", item.label));
      card.appendChild(el("strong", "kpi-value", formatNumber(item.value)));
      card.appendChild(el("span", "kpi-note", item.note || ""));
      container.appendChild(card);
    });
  }

  function renderBars(container, entries) {
    clear(container);
    if (!entries.length) {
      container.appendChild(emptyState("Noch keine Daten", "Sobald Onboarding-Ereignisse verfügbar sind, erscheint hier die Verteilung."));
      return;
    }
    entries.slice(0, 8).forEach((entry) => {
      const row = el("div", "bar-row");
      row.appendChild(el("span", "bar-label", entry.label));
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      track.appendChild(fill);
      row.append(track, el("span", "bar-value", `${entry.percent.toFixed(1)} %`));
      container.appendChild(row);
      requestAnimationFrame(() => { fill.style.width = `${entry.percent}%`; });
    });
  }

  function renderAutomations() {
    clear(dom.automationStatusGrid);
    clear(dom.automationRuns);
    const expected = [
      { key: "github_collector", name: "GitHub Collector", source: "github" },
      { key: "reddit_collector", name: "Reddit Collector", source: "reddit" },
      { key: "support_collector", name: "Support Mail", source: "gmail" },
      { key: "ankiweb_collector", name: "AnkiWeb Collector", source: "ankiweb" },
      { key: "ai_triage", name: "AI Triage", source: "other" },
      { key: "daily_briefing", name: "Tagesbriefing", source: "other" },
    ];
    expected.forEach((scenario) => {
      const latest = state.data.runs.find((run) => run.scenario_key === scenario.key);
      const card = el("article", "automation-card");
      const head = el("div", "automation-card-head");
      head.append(el("h3", "", scenario.name), statusDot(latest?.status || "warning"));
      card.appendChild(head);
      card.appendChild(el("p", "", latest ? `${statusLabel(latest.status)} · ${relativeTime(latest.finished_at || latest.started_at)}` : "Noch kein Lauf protokolliert"));
      dom.automationStatusGrid.appendChild(card);
    });

    if (!state.data.runs.length) {
      dom.automationRuns.appendChild(emptyState("Noch keine Läufe", "Make schreibt nach jedem Szenario einen Eintrag in automation_runs."));
      return;
    }
    state.data.runs.slice(0, 20).forEach((run) => {
      const row = el("div", "run-row");
      row.appendChild(statusDot(run.status));
      const main = el("div", "run-row-main");
      main.append(el("strong", "", run.scenario_name), el("small", "", formatDateTime(run.started_at)));
      const result = run.status === "failed" ? (run.error_message || "Fehler") : `${run.items_created || 0} neue Einträge`;
      row.append(main, el("span", "run-result", result));
      dom.automationRuns.appendChild(row);
    });
  }

  function buildFallbackAlerts() {
    const alerts = [];
    const critical = state.data.inbox.filter((item) => effectivePriority(item) === "critical" && item.status !== "resolved");
    if (critical.length) alerts.push({ title: `${critical.length} kritische Signale`, detail: "Bitte zeitnah in der Inbox prüfen." });
    const failed = state.data.runs.filter((run) => run.status === "failed" && isWithinHours(run.started_at, 24));
    if (failed.length) alerts.push({ title: `${failed.length} fehlgeschlagene Automationen`, detail: failed[0].error_message || "Make-Ausführung prüfen." });
    const failedActions = state.data.actions.filter((action) => action.status === "dispatch_failed");
    if (failedActions.length) alerts.push({ title: `${failedActions.length} Aktionen nicht versendet`, detail: "Sie können in der Freigabe-Queue erneut gesendet werden." });
    return alerts;
  }

  function demoData() {
    const now = Date.now();
    const hoursAgo = (hours) => new Date(now - hours * 3600000).toISOString();
    return {
      inbox: [
        {
          id: "demo-1", source: "github", external_id: "16", item_type: "issue",
          title: "Consistency stat inflated by manual reschedule entries",
          content: "The consistency statistic appears to count revlog type=4 entries.",
          author_handle: "betterpull10", category: "bug", priority: "high", status: "new",
          published_at: hoursAgo(3), ingested_at: hoursAgo(3), external_url: "https://github.com/mobesamedia/SynapsePro/issues/16",
          ai_analyses: [{ summary_de: "Manuelle Neuplanungen werden vermutlich fälschlich als Lerntage gezählt und erhöhen die Konsistenzstatistik.", component: "statistics", confidence: 0.94, suggested_reply: "Danke für den präzisen Bericht. Ich prüfe die Filterung der revlog-Typen und melde mich im Issue mit einem Test-Build." }],
        },
        {
          id: "demo-2", source: "ankiweb", external_id: "review-demo-1", item_type: "review",
          title: "Mehr Anpassbarkeit für das Dashboard",
          content: "I would like to rearrange and resize the dashboard cards.",
          author_handle: "languagelearner", category: "feature", priority: "normal", status: "new",
          published_at: hoursAgo(5), ingested_at: hoursAgo(5), external_url: "https://ankiweb.net/shared/info/236979321",
          ai_analyses: [{ summary_de: "Ein Nutzer möchte Dashboard-Karten neu anordnen und ihre Größe verändern.", component: "dashboard", confidence: 0.91, suggested_reply: "Vielen Dank für den Vorschlag. Mehr Anpassbarkeit des Dashboards steht bereits auf der Produkt-Roadmap." }],
        },
        {
          id: "demo-3", source: "reddit", external_id: "comment-demo-1", item_type: "comment",
          title: "Frage zur lokalen AI",
          content: "Can I use the AI assistant completely offline with Ollama?",
          author_handle: "anki_student", category: "question", priority: "normal", status: "triaged",
          published_at: hoursAgo(7), ingested_at: hoursAgo(7), external_url: "https://www.reddit.com/r/SynapseProAnki/",
          ai_analyses: [{ summary_de: "Der Nutzer fragt, ob der AI-Assistent mit Ollama vollständig lokal verwendet werden kann.", component: "ai_assistant", confidence: 0.98, suggested_reply: "Ja. Mit Ollama kann der Assistent lokal betrieben werden. Nach der Installation wählst du Ollama in den SynapsePro-Einstellungen als Anbieter aus." }],
        },
        {
          id: "demo-4", source: "gmail", external_id: "mail-demo-1", item_type: "email",
          title: "SoundCloud stops when closing player",
          content: "Music drops out whenever I close the music player window.",
          author_handle: "support-user", category: "bug", priority: "critical", status: "new",
          published_at: hoursAgo(10), ingested_at: hoursAgo(10),
          ai_analyses: [{ summary_de: "SoundCloud stoppt beim Schließen des Players. Das Problem ähnelt GitHub-Issue #15.", component: "music_player", confidence: 0.89, suggested_reply: "Danke für deine Nachricht. Das Problem ist bereits erfasst. Bitte sende zusätzlich deine Anki- und Betriebssystemversion, damit ich den Fehler sicher nachstellen kann." }],
        },
        {
          id: "demo-5", source: "ankiweb", external_id: "review-demo-2", item_type: "review",
          title: "Positive portugiesische Bewertung",
          content: "Simplesmente incrível e tem suporte para o meu idioma.",
          author_handle: "br-user", category: "praise", priority: "low", status: "triaged",
          published_at: hoursAgo(12), ingested_at: hoursAgo(12), external_url: "https://ankiweb.net/shared/info/236979321",
          ai_analyses: [{ summary_de: "Der Nutzer lobt insbesondere die portugiesische Übersetzung.", component: "localization", confidence: 0.97, suggested_reply: "Muito obrigado! Fico muito feliz que a tradução ajude nos seus estudos." }],
        },
      ],
      actions: [
        {
          id: "action-1", inbox_item_id: "demo-3", action_type: "reddit_reply", destination: "reddit",
          draft_text: "Ja. Mit Ollama kann der SynapsePro AI-Assistent vollständig lokal betrieben werden. Wähle Ollama einfach in den Einstellungen als Anbieter aus.",
          status: "pending", requested_at: hoursAgo(1), inbox_items: { source: "reddit", title: "Frage zur lokalen AI", external_url: "https://www.reddit.com/r/SynapseProAnki/" },
        },
        {
          id: "action-2", inbox_item_id: "demo-4", action_type: "support_reply", destination: "gmail",
          draft_text: "Danke für deine Nachricht. Das Problem ist bereits als GitHub-Issue erfasst. Kannst du mir bitte noch deine Anki-Version, dein Betriebssystem und die genauen Schritte schicken?",
          status: "pending", requested_at: hoursAgo(2), inbox_items: { source: "gmail", title: "SoundCloud stops when closing player" },
        },
      ],
      briefings: [{
        id: "briefing-demo", briefing_date: new Date().toISOString().slice(0, 10), headline: "Support und Statistik brauchen heute Aufmerksamkeit",
        summary: "In den letzten 24 Stunden wurden fünf relevante Eingänge erkannt. Der SoundCloud-Fehler taucht erneut auf, während portugiesische Nutzer die Lokalisierung besonders positiv hervorheben.",
        priorities: [
          { title: "Statistik-Issue #16 untersuchen", detail: "Möglicherweise werden manuelle Neuplanungen als Lerntage gezählt." },
          { title: "SoundCloud-Rückmeldung beantworten", detail: "Zusätzliche Systeminformationen anfordern und mit Issue #15 verknüpfen." },
          { title: "Portugiesische FAQ priorisieren", detail: "Aktuelle Bewertungen zeigen starkes positives Interesse aus Brasilien." },
        ],
        alerts: [{ title: "Wiederkehrender Musikfehler", detail: "Zwei Plattformen melden ähnliche SoundCloud-Aussetzer." }],
      }],
      runs: [
        { id: "run-1", scenario_key: "github_collector", scenario_name: "GitHub Collector", source: "github", status: "success", items_read: 7, items_created: 1, started_at: hoursAgo(1.2), finished_at: hoursAgo(1.1) },
        { id: "run-2", scenario_key: "reddit_collector", scenario_name: "Reddit Collector", source: "reddit", status: "success", items_read: 12, items_created: 1, started_at: hoursAgo(2.2), finished_at: hoursAgo(2.1) },
        { id: "run-3", scenario_key: "support_collector", scenario_name: "Support Mail", source: "gmail", status: "success", items_read: 3, items_created: 1, started_at: hoursAgo(0.8), finished_at: hoursAgo(0.7) },
        { id: "run-4", scenario_key: "ankiweb_collector", scenario_name: "AnkiWeb Collector", source: "ankiweb", status: "warning", items_read: 28, items_created: 2, error_message: "Bewertung ohne stabilen Autor-Identifier", started_at: hoursAgo(6), finished_at: hoursAgo(5.9) },
        { id: "run-5", scenario_key: "ai_triage", scenario_name: "AI Triage", status: "success", items_read: 5, items_created: 5, started_at: hoursAgo(0.6), finished_at: hoursAgo(0.5) },
        { id: "run-6", scenario_key: "daily_briefing", scenario_name: "Tagesbriefing", status: "success", items_read: 5, items_created: 1, started_at: hoursAgo(4), finished_at: hoursAgo(3.9) },
      ],
      onboarding: [
        { created_at: hoursAgo(1), lang: "pt", role: "medical", source: "social" },
        { created_at: hoursAgo(2), lang: "en", role: "language", source: "ankiStore" },
        { created_at: hoursAgo(5), lang: "de", role: "medical", source: "recommendation" },
        { created_at: hoursAgo(18), lang: "pt", role: "medical", source: "social" },
        { created_at: hoursAgo(28), lang: "fr", role: "law", source: "ankiStore" },
        { created_at: hoursAgo(52), lang: "pt", role: "other", source: "social" },
      ],
    };
  }

  function analysisOf(item) {
    if (!item?.ai_analyses) return null;
    return Array.isArray(item.ai_analyses) ? item.ai_analyses[0] || null : item.ai_analyses;
  }

  function effectiveCategory(item) { return analysisOf(item)?.category || item.category || "other"; }
  function effectivePriority(item) { return analysisOf(item)?.priority || item.priority || "normal"; }

  function distribution(rows, key) {
    const counts = new Map();
    rows.forEach((row) => {
      const value = row[key];
      if (value !== null && value !== undefined && value !== "") counts.set(String(value), (counts.get(String(value)) || 0) + 1);
    });
    const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count, percent: total ? count / total * 100 : 0 }))
      .sort((a, b) => b.count - a.count);
  }

  function sourceMeta(source) { return SOURCE_META[source] || { ...SOURCE_META.other, label: source || "Andere" }; }

  function sourceIcon(source) {
    const meta = sourceMeta(source);
    const icon = el("span", "source-icon", meta.short);
    icon.style.setProperty("--source-color", meta.color);
    icon.style.setProperty("--source-bg", meta.bg);
    icon.title = meta.label;
    return icon;
  }

  function categoryLabel(category) {
    return ({ bug: "Bug", feature: "Feature-Wunsch", question: "Frage", praise: "Lob", spam: "Spam", other: "Sonstiges" })[category] || category || "Sonstiges";
  }

  function priorityLabel(priority) {
    return ({ low: "Niedrig", normal: "Normal", high: "Hoch", critical: "Kritisch" })[priority] || priority || "Normal";
  }

  function actionTypeLabel(type) {
    return ({
      github_comment: "GitHub-Kommentar veröffentlichen",
      github_issue: "GitHub-Issue erstellen",
      reddit_reply: "Reddit-Antwort veröffentlichen",
      reddit_post: "Reddit-Post veröffentlichen",
      support_reply: "Support-E-Mail senden",
      website_publish: "Website-Inhalt veröffentlichen",
      changelog_publish: "Changelog aktualisieren",
    })[type] || String(type || "Aktion").replaceAll("_", " ");
  }

  function statusLabel(status) {
    return ({ running: "Läuft", success: "Erfolgreich", warning: "Warnung", failed: "Fehlgeschlagen", pending: "Ausstehend", approved: "Freigegeben", completed: "Abgeschlossen", dispatch_failed: "Versand fehlgeschlagen" })[status] || status;
  }

  function statusDot(status) {
    const dot = el("span", "status-dot");
    dot.dataset.status = status;
    dot.title = statusLabel(status);
    return dot;
  }

  function statusBadge(status) {
    const badge = el("span", "status-badge", statusLabel(status));
    badge.dataset.status = status;
    return badge;
  }

  function drawerSection(title, text) {
    const section = el("section", "drawer-section");
    section.append(el("h3", "", title), el("p", "", text));
    return section;
  }

  function metaPill(text, extraClass = "") { return el("span", `meta-pill ${extraClass}`.trim(), text); }

  function emptyState(title, text) {
    const wrap = el("div", "empty-state");
    wrap.append(el("strong", "", title), document.createTextNode(text));
    return wrap;
  }

  function normalizeList(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch { return [value]; }
    }
    return [value];
  }

  function relativeTime(value) {
    const time = Date.parse(value || "");
    if (!Number.isFinite(time)) return "–";
    const diff = Date.now() - time;
    const minutes = Math.max(0, Math.round(diff / 60000));
    if (minutes < 1) return "gerade eben";
    if (minutes < 60) return `vor ${minutes} Min.`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.round(hours / 24);
    if (days < 8) return `vor ${days} T.`;
    return formatDate(value, { day: "2-digit", month: "2-digit" });
  }

  function formatDate(value, options = { day: "2-digit", month: "short", year: "numeric" }) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "–" : date.toLocaleDateString("de-DE", options);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "–" : date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function isWithinHours(value, hours) {
    const time = Date.parse(value || "");
    return Number.isFinite(time) && time >= Date.now() - hours * 3600000;
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 11) return "Guten Morgen";
    if (hour < 18) return "Guten Tag";
    return "Guten Abend";
  }

  function formatNumber(value) { return Number(value || 0).toLocaleString("de-DE"); }
  function truncate(value, length) { const text = String(value || ""); return text.length > length ? `${text.slice(0, length - 1)}…` : text; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function toCamel(value) { return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase()); }

  function el(tag, className = "", text = null) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== null && text !== undefined) node.textContent = String(text);
    return node;
  }

  function button(text, className) {
    const node = el("button", className, text);
    node.type = "button";
    return node;
  }

  function setAuthStatus(message, isError = false) {
    dom.authStatus.textContent = message;
    dom.authStatus.classList.toggle("is-error", isError);
  }

  function setLoading(loading) {
    dom.loadingBar.classList.toggle("is-loading", loading);
    dom.refreshButton.disabled = loading;
  }

  function showGlobalMessage(message) {
    dom.globalMessage.textContent = message;
    dom.globalMessage.classList.remove("is-hidden");
  }

  function clearGlobalMessage() {
    dom.globalMessage.classList.add("is-hidden");
    dom.globalMessage.textContent = "";
  }

  function toast(message, isError = false) {
    const item = el("div", `toast${isError ? " is-error" : ""}`, message);
    dom.toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 4200);
  }
})();
