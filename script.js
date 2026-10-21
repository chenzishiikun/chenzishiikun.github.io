(() => {
  const data = window.CampusData
  const api = window.CampusAPI
  const viewRoot = document.querySelector("#view-root")
  const dialog = document.querySelector("#app-dialog")
  const dialogContent = document.querySelector("#dialog-content")
  const toastRegion = document.querySelector("#toast-region")
  const searchInput = document.querySelector("#global-search")
  const pageNames = {
    home: "校园首页",
    wall: "校园墙",
    errands: "校内跑腿",
    market: "二手集市",
    notices: "通知公告",
    profile: "个人中心",
    saved: "我的收藏",
  }
  let activeRoute = "home"
  let activeFilter = "全部"
  let managementTab = "all"
  let forumExpanded = false
  let tasksVisible = true
  let tasksTrigger = null
  let navCollapsed = false
  let searchTerm = ""
  let currentPayload = null
  let profileTrigger = null
  let toastTimer

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => {
      const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
      return entities[character]
    })

  const matchesSearch = (...values) =>
    !searchTerm || values.join(" ").toLocaleLowerCase().includes(searchTerm.toLocaleLowerCase())

  const updateNoticeCount = (count) => {
    document.querySelector("#notice-dot").hidden = count === 0
    document.querySelector("#top-notice-dot").hidden = count === 0
  }

  const renderNavigation = () => {
    const sidebar = document.querySelector("#sidebar")
    sidebar.classList.toggle("is-collapsed", navCollapsed)
    document.querySelector(".app-frame").classList.toggle("is-nav-collapsed", navCollapsed)
    const toggle = document.querySelector(".nav-collapse-button")
    toggle.setAttribute("aria-expanded", String(!navCollapsed))
    toggle.setAttribute("aria-label", navCollapsed ? "展开导航栏" : "折叠导航栏")
    toggle.title = navCollapsed ? "展开导航栏" : "折叠导航栏"
    toggle.querySelector("span").textContent = navCollapsed ? "›" : "‹"
  }

  const persistNavigation = () => {
    try {
      localStorage.setItem("campus-hui-nav-collapsed", String(navCollapsed))
    } catch (error) {
      showError(new Error(`无法保存导航栏状态：${error.message}`))
    }
    renderNavigation()
  }

  const flash = (message, kind = "success") => {
    toastRegion.innerHTML = `<div class="toast toast-${kind}"><span>${kind === "error" ? "!" : "✓"}</span><p>${escapeHtml(message)}</p><button type="button" aria-label="关闭提示">×</button></div>`
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => (toastRegion.innerHTML = ""), 3400)
  }

  const showError = (error) => {
    console.error("[校园汇]", error)
    flash(error.message || "操作失败，请稍后重试。", "error")
  }

  try {
    const savedTasksVisibility = localStorage.getItem("campus-hui-tasks-visible")
    if (savedTasksVisibility === "false") tasksVisible = false
    navCollapsed = localStorage.getItem("campus-hui-nav-collapsed") === "true"
    const savedHomework = localStorage.getItem("campus-hui-homework")
    if (savedHomework) {
      const completedIds = JSON.parse(savedHomework)
      if (!Array.isArray(completedIds) || completedIds.some((id) => typeof id !== "string")) {
        throw new Error("作业状态格式无效。")
      }
      data.homework.forEach((task) => {
        task.done = completedIds.includes(task.id)
      })
    }
  } catch (error) {
    showError(new Error(`无法读取待办栏设置：${error.message}`))
  }

  const cardAction = (label, action, id, className = "button button-small") =>
    `<button type="button" class="${className}" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`

  const avatar = (text, extra = "") =>
    `<span class="avatar ${extra}" aria-hidden="true">${escapeHtml(text || "同")}</span>`

  const postCard = (post) => `
    <article class="post-card">
      <div class="post-author">
        ${avatar(post.avatar)}
        <div class="author-meta"><strong>${escapeHtml(post.author)}${post.verified ? '<span class="verified-mark" title="演示认证标记">✓</span>' : ""}</strong><small>${escapeHtml(post.department)} <i>·</i> ${escapeHtml(post.time)}</small></div>
        <span class="post-category">${escapeHtml(post.category)}</span>
        <button class="more-button" aria-label="更多动态选项" type="button" data-action="post-more">•••</button>
      </div>
      <p class="post-copy">${escapeHtml(post.text)}</p>
      ${post.imageColor ? `<div class="post-image ${escapeHtml(post.imageColor)}" role="img" aria-label="${escapeHtml(post.imageAlt || "校园生活示例图片")}"><span class="image-caption">校园日常 · 示例图片</span></div>` : ""}
      <div class="post-actions">
        <button type="button" class="${post.liked ? "is-liked" : ""}" data-action="like" data-id="${escapeHtml(post.id)}" aria-label="${post.liked ? "取消喜欢" : "喜欢"}，${post.likes} 个赞"><span>${post.liked ? "♥" : "♡"}</span> ${post.likes}</button>
        <button type="button" data-action="comment" data-id="${escapeHtml(post.id)}"><span>◷</span> ${post.comments} 条回应</button>
        <button type="button" data-action="share" data-id="${escapeHtml(post.id)}"><span>↗</span> 分享</button>
      </div>
    </article>`

  const errandCard = (item, compact = false) => `
    <article class="errand-card ${compact ? "errand-card-compact" : ""}">
      <div class="errand-card-heading"><span class="type-pill type-${item.category === "取快递" ? "mint" : item.category === "带餐饮" ? "peach" : "blue"}">${escapeHtml(item.category)}</span><span class="time-text">${escapeHtml(item.time)}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="errand-detail">${escapeHtml(item.detail)}</p>
      <div class="errand-route"><div><i class="route-dot route-start"></i><span>${escapeHtml(item.from)}</span></div><div><i class="route-dot route-end"></i><span>${escapeHtml(item.to)}</span></div></div>
      <div class="errand-card-bottom"><span class="errand-owner">${avatar(item.avatar, "avatar-small")} ${escapeHtml(item.author)}${item.verified ? '<i class="verified-mark">✓</i>' : ""}</span><strong class="reward">${item.reward ? `¥${escapeHtml(item.reward)} <small>感谢费</small>` : ""}</strong>${item.status === "待接单" && item.author !== data.currentUser.name ? cardAction("顺路帮忙", "claim", item.id) : `<span class="status-done">${escapeHtml(item.taskRole || (item.status === "待接单" ? "我的需求" : "已接单 · 演示"))}</span>`}</div>
    </article>`

  const listingCard = (item) => `
    <article class="listing-card">
      <div class="listing-visual ${escapeHtml(item.color)}"><span class="listing-emoji" aria-hidden="true">${escapeHtml(item.emoji)}</span><span class="condition-pill">${escapeHtml(item.condition)}</span><button type="button" class="favorite-button ${item.saved ? "is-saved" : ""}" data-action="favorite" data-id="${escapeHtml(item.id)}" aria-label="${item.saved ? "取消收藏" : "收藏"} ${escapeHtml(item.title)}">${item.saved ? "♥" : "♡"}</button></div>
      <div class="listing-info"><span class="listing-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><div class="listing-price">¥${escapeHtml(item.price)}${item.originalPrice ? `<del>¥${escapeHtml(item.originalPrice)}</del>` : ""}</div><div class="seller-row">${avatar(item.avatar, "avatar-tiny")}<span>${escapeHtml(item.seller)} <i>·</i> ${escapeHtml(item.location)}</span><button type="button" data-action="contact-seller" data-id="${escapeHtml(item.id)}" aria-label="联系卖家">聊聊</button></div></div>
    </article>`

  const noticeCard = (notice) => `
    <article class="notice-card ${notice.read ? "notice-read" : ""}">
      <span class="notice-icon ${notice.important ? "notice-icon-warm" : ""}">${notice.important ? "!" : "▤"}</span>
      <div class="notice-copy"><div class="notice-meta"><span>${escapeHtml(notice.category)}</span>${notice.important ? '<span class="important-label">重要</span>' : ""}<time>${escapeHtml(notice.date)}</time></div><h3>${escapeHtml(notice.title)}</h3><p>${escapeHtml(notice.content)}</p></div>
      ${notice.read ? '<span class="read-label">已读</span>' : cardAction("标记已读", "mark-read", notice.id, "button button-outline button-tiny")}
    </article>`

  const sectionHeading = (eyebrow, title, description, action = "") =>
    `<div class="view-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${title}</h1><p>${escapeHtml(description)}</p></div>${action}</div>`

  const newButton = (label, type, icon = "+") =>
    `<button class="button button-primary" type="button" data-action="new" data-type="${escapeHtml(type)}"><span>${escapeHtml(icon)}</span> ${escapeHtml(label)}</button>`

  const managementTabs = (tabs) =>
    `<nav class="management-tabs" aria-label="内容管理">${tabs.map(([key, label]) => `<button type="button" data-action="management-tab" data-tab="${key}" class="${managementTab === key ? "is-selected" : ""}" aria-current="${managementTab === key ? "page" : "false"}">${label}</button>`).join("")}</nav>`

  const messageList = (section) => {
    const messages = data.userMessages.filter((message) => message.section === section)
    return `<div class="user-message-list">${messages.map((message) => `<article class="user-message"><span class="message-indicator">•</span><div><strong>${escapeHtml(message.title)}</strong><p>${escapeHtml(message.detail)}</p></div></article>`).join("")}</div>`
  }

  const forumThreadCard = (thread) => `
    <article class="forum-thread"><div class="thread-votes"><span>↑</span><strong>${escapeHtml(thread.likes)}</strong><small>喜欢</small></div><div class="thread-body"><div class="thread-labels">${thread.pinned ? '<span class="pinned-tag">推荐</span>' : ""}<span class="thread-category">${escapeHtml(thread.category)}</span></div><h3>${escapeHtml(thread.title)}</h3><p>${escapeHtml(thread.content)}</p><div class="thread-meta">${avatar(thread.avatar, "avatar-tiny")}<span>${escapeHtml(thread.author)} · ${escapeHtml(thread.department)} · ${escapeHtml(thread.time)}</span><span class="thread-replies">◷ ${escapeHtml(thread.replies)} 条回应</span></div></div></article>`

  const shuffle = (items) => {
    const shuffled = [...items]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1))
      ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
    }
    return shuffled
  }

  const homeFeedCard = (item) => {
    const height = 190 + Math.floor(Math.random() * 111)
    const span = Math.random() < 0.35 ? 2 : 1
    if (item.type === "activity") {
      return `<article class="home-feed-card home-feed-activity" style="--feed-card-height:${height}px;--feed-card-span:${span}"><span class="home-feed-symbol" aria-hidden="true">◷</span><h3>${escapeHtml(item.activity.title)}</h3><p>${escapeHtml(item.activity.detail)}</p></article>`
    }
    const thread = item.thread
    return `<article class="home-feed-card home-feed-thread" style="--feed-card-height:${height}px;--feed-card-span:${span}"><span class="home-feed-symbol" aria-hidden="true">“</span><h3>${escapeHtml(thread.title)}</h3><p>${escapeHtml(thread.content)}</p><div class="home-feed-meta">${avatar(thread.avatar, "avatar-tiny")}<span>${escapeHtml(thread.author)} · ${escapeHtml(thread.time)}</span><span>${escapeHtml(thread.replies)} 条回应</span></div></article>`
  }

  const renderTaskRail = () => {
    const rail = document.querySelector("#task-rail")
    rail.classList.toggle("is-visible", tasksVisible)
    rail.setAttribute("aria-hidden", String(!tasksVisible))
    rail.inert = !tasksVisible
    const backdrop = document.querySelector(".task-backdrop")
    backdrop.classList.toggle("is-visible", tasksVisible)
    backdrop.setAttribute("aria-hidden", String(!tasksVisible))
    document.querySelectorAll("[data-task-toggle-label]").forEach((label) => {
      label.textContent = tasksVisible ? "隐藏待办栏" : "显示待办栏"
    })
    document.querySelectorAll('[data-action="toggle-tasks"]').forEach((button) => {
      button.setAttribute("aria-expanded", String(tasksVisible))
      button.setAttribute("aria-label", tasksVisible ? "隐藏待办任务栏" : "显示待办任务栏")
    })
    document.querySelector("#homework-list").innerHTML = data.homework.map((task) => `<button type="button" class="task-item ${task.done ? "is-done" : ""}" data-action="toggle-homework" data-id="${escapeHtml(task.id)}" aria-pressed="${task.done}"><span class="task-checkbox">${task.done ? "✓" : ""}</span><span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.detail)}</small></span></button>`).join("")
    document.querySelector("#activity-list").innerHTML = data.campusActivities.map((activity) => `<article class="task-item task-event"><span class="task-event-icon">◷</span><span><strong>${escapeHtml(activity.title)}</strong><small>${escapeHtml(activity.detail)}</small></span></article>`).join("")
  }

  const setTasksVisible = (visible, trigger = null) => {
    const rail = document.querySelector("#task-rail")
    if (visible && trigger && !rail.contains(trigger)) tasksTrigger = trigger
    if (!visible && rail.contains(document.activeElement)) {
      const focusTarget = tasksTrigger?.isConnected
        ? tasksTrigger
        : document.querySelector(".task-open-button")
      focusTarget.focus()
    }
    tasksVisible = visible
    try {
      localStorage.setItem("campus-hui-tasks-visible", String(tasksVisible))
    } catch (error) {
      showError(new Error(`无法保存待办栏展示设置：${error.message}`))
    }
    renderTaskRail()
  }

  const openProfileDrawer = (trigger) => {
    const drawer = document.querySelector("#profile-drawer")
    profileTrigger = trigger
    document.querySelector("[data-profile-avatar]").textContent = data.currentUser.avatar
    document.querySelector("[data-profile-name]").textContent = data.currentUser.name
    document.querySelector("[data-profile-school]").textContent = data.currentUser.school
    document.querySelector("[data-profile-class]").textContent = `${data.currentUser.department} · ${data.currentUser.className}`
    drawer.inert = false
    drawer.classList.add("is-open")
    drawer.setAttribute("aria-hidden", "false")
    document.querySelector(".profile-backdrop").hidden = false
    document.querySelector(".profile-drawer-close").focus()
  }

  const closeProfileDrawer = () => {
    const drawer = document.querySelector("#profile-drawer")
    const wasOpen = drawer.classList.contains("is-open")
    drawer.classList.remove("is-open")
    drawer.setAttribute("aria-hidden", "true")
    drawer.inert = true
    document.querySelector(".profile-backdrop").hidden = true
    if (wasOpen) {
      profileTrigger?.focus()
      profileTrigger = null
    }
  }

  const renderHome = async () => {
    const home = await api.getHome()
    currentPayload = home
    updateNoticeCount(home.unreadCount)
    document.querySelector("#wall-count").textContent = home.posts.length
    const threads = (await api.getForumThreads()).filter((thread) => matchesSearch(thread.title, thread.content, thread.author, thread.category))
    const activities = data.campusActivities.filter((activity) => matchesSearch(activity.title, activity.detail))
    const forumItems = threads.slice(0, forumExpanded ? threads.length : 4).map((thread) => ({ type: "thread", thread }))
    const feedItems = shuffle([...forumItems, ...activities.map((activity) => ({ type: "activity", activity }))])
    viewRoot.innerHTML = `
      <section class="campus-intro">
        <p class="eyebrow">WELCOME TO YOUR CAMPUS</p><span class="campus-label">示例大学 · 校园体验空间</span>
        <h1>${escapeHtml(data.campus.motto)}</h1><p class="campus-description">${escapeHtml(data.campus.introduction)}</p>
        <div class="campus-highlights">${data.campus.highlights.map((highlight) => `<span>${escapeHtml(highlight)}</span>`).join("")}</div>
        <button class="button button-outline" type="button" data-action="campus-switch">了解校园资料 <span>↗</span></button>
      </section>
      <section class="home-campus-section">
        <div class="panel-heading"><div><p class="eyebrow">CAMPUS LIFE</p><h2>校园动态</h2></div><button class="button button-primary button-small" type="button" data-action="new" data-type="thread">发起讨论</button></div>
        <p class="section-description">校园讨论与活动动态随机呈现。内容仅为本地演示。</p>
        <div class="home-feed-grid" id="campus-forum">${feedItems.length ? feedItems.map(homeFeedCard).join("") : '<div class="empty-state"><strong>暂时没有校园动态</strong><p>稍后再来看看，或发起一个新讨论。</p></div>'}</div>
      </section>
      <section class="home-bottom-grid">
        <div class="aside-panel announcement-panel"><div class="aside-panel-heading"><div><p class="eyebrow">CAMPUS NOTICE</p><h3>校园通知</h3></div><a href="#/notices" aria-label="全部校园通知">↗</a></div>${home.notices.slice(0, 3).map((notice) => `<a href="#/notices" class="announcement-item"><span class="announcement-dot ${notice.important ? "dot-important" : ""}"></span><span><strong>${escapeHtml(notice.title)}</strong><small>${escapeHtml(notice.date)}</small></span></a>`).join("")}</div>
        <div class="aside-panel campus-profile-summary"><p class="eyebrow">CAMPUS IDENTITY</p><h3>校园资料</h3><dl><dt>学校</dt><dd>${escapeHtml(data.currentUser.school)}</dd><dt>学院 / 班级</dt><dd>${escapeHtml(data.currentUser.department)} · ${escapeHtml(data.currentUser.className)}</dd></dl><small>仅展示虚构的校园级资料，不含个人动态或真实认证信息。</small></div>
      </section>`
  }

  const renderWall = async () => {
    const posts = (await api.getPosts()).filter((post) => matchesSearch(post.author, post.text, post.category))
    const scopedPosts = managementTab === "mine" ? posts.filter((post) => post.author === data.currentUser.name) : posts
    const filtered = activeFilter === "全部" ? scopedPosts : scopedPosts.filter((post) => post.category === activeFilter)
    currentPayload = posts
    document.querySelector("#wall-count").textContent = posts.length
    viewRoot.innerHTML = `
      ${sectionHeading("THE CAMPUS WALL", "校园墙 <span class=\"heading-emoji\">▧</span>", "在这里分享校园里的小事、求助和新发现。请友善表达，共同维护真实、有序的同校交流空间。", newButton("发布动态", "post"))}
      ${managementTabs([["all", "动态广场"], ["mine", "我的发布"], ["messages", "消息通知"]])}
      <div class="wall-layout"><div class="content-panel wall-feed">${managementTab === "messages" ? messageList("wall") : `<div class="wall-toolbar"><div class="filter-tabs" role="group" aria-label="校园墙分类">${data.wallCategories.map((category) => `<button type="button" data-action="filter" data-filter="${escapeHtml(category)}" class="${activeFilter === category ? "is-selected" : ""}">${escapeHtml(category)}</button>`).join("")}</div><button type="button" class="sort-select" data-action="sort-wall">最新发布⌄</button></div><div class="post-list">${filtered.length ? filtered.map(postCard).join("") : `<div class="empty-state"><span>▧</span><strong>${managementTab === "mine" ? "你还没有发布动态" : "这里暂时还没有内容"}</strong><p>${managementTab === "mine" ? "发布后可在这里管理自己的校园墙内容。" : "做第一个分享校园生活的人吧。"}</p></div>`}</div><div class="list-end">— 已经到底啦，去校园里发现更多新鲜事吧 —</div>`}</div><aside class="wall-aside"><div class="aside-panel wall-guideline"><span class="guideline-icon">✳</span><p class="eyebrow">A KIND CAMPUS</p><h3>让分享保持<br />真诚与友善。</h3><p>不发布他人隐私信息，不传播未经证实的内容。遇到问题可以使用反馈入口。</p><button type="button" class="text-button" data-action="guide">社区公约 <span>↗</span></button></div><div class="aside-panel wall-topics"><div class="aside-panel-heading"><h3>热门讨论</h3><a href="#/home?section=forum">论坛 ↗</a></div><a href="#/home?section=forum"># 今天校园里发生了什么</a><a href="#/home?section=forum"># 期末复习搭子集合</a><a href="#/home?section=forum"># 失物招领互助</a></div></aside></div>`
  }

  const renderErrands = async () => {
    const errands = (await api.getErrands()).filter((item) => matchesSearch(item.title, item.detail, item.from, item.to))
    const profile = managementTab === "mine" ? await api.getProfile() : null
    const myErrands = errands.filter((item) => item.author === data.currentUser.name)
    const ownTasks = [...myErrands, ...(profile?.myOrders || []).filter((order) => !myErrands.some((item) => item.id === order.id)).map((order) => ({ ...order, detail: "已接单 · 本地演示", from: "校园任务", to: "状态记录", reward: "", author: data.currentUser.name, avatar: data.currentUser.avatar, time: "", status: order.status, category: "我的任务", taskRole: "我已接单" }))]
    const scopedErrands = managementTab === "mine" ? ownTasks : errands
    const filtered = activeFilter === "全部" ? scopedErrands : scopedErrands.filter((item) => item.category === activeFilter)
    currentPayload = errands
    viewRoot.innerHTML = `
      ${sectionHeading("CAMPUS HELPERS", "校内跑腿 <span class=\"heading-emoji\">↗</span>", "同校互助，顺路帮忙。需求和接单目前只在本浏览器中演示，不会产生实际订单或支付。", newButton("发布需求", "errand"))}
      <div class="errand-info-strip"><span class="strip-icon">✳</span><span><strong>让顺路的善意，刚好抵达。</strong><small>当前为本地体验模式。感谢费仅供演示参考，不涉及真实支付。</small></span><span class="strip-flower">✿</span></div>
      ${managementTabs([["all", "需求广场"], ["mine", "我的任务"], ["messages", "消息通知"]])}
      <div class="page-with-aside"><section class="errand-list-section">${managementTab === "messages" ? messageList("errands") : `<div class="list-toolbar"><div class="filter-tabs" role="group" aria-label="跑腿分类">${data.errandsCategories.map((category) => `<button type="button" data-action="filter" data-filter="${escapeHtml(category)}" class="${activeFilter === category ? "is-selected" : ""}">${escapeHtml(category)}</button>`).join("")}</div><span>${filtered.length} 条${managementTab === "mine" ? "我的任务" : "附近需求"}</span></div><div class="errand-list">${filtered.length ? filtered.map((item) => errandCard(item)).join("") : `<div class="empty-state"><span>↗</span><strong>${managementTab === "mine" ? "还没有个人任务记录" : "还没有找到这类需求"}</strong><p>${managementTab === "mine" ? "发布需求或接单后，状态会显示在这里。" : "换个分类看看，或者发布一个需求。"}</p></div>`}</div>`}</section><aside class="page-aside"><div class="aside-panel helper-card"><span class="helper-illustration">↗</span><p class="eyebrow">CAMPUS HELP</p><h3>校园跑腿<br />互助任务。</h3><p>查看需求、发布任务和管理本地演示状态。</p>${newButton("发布一个需求", "errand", "+")}</div><div class="aside-panel safe-note"><span>✓</span><div><strong>安全提醒</strong><p>仅在公共、开放区域交接物品。不要通过页面提交银行卡或密码等敏感信息。</p></div></div></aside></div>`
  }

  const renderMarket = async () => {
    const listings = (await api.getListings()).filter((item) => matchesSearch(item.title, item.category, item.seller, item.location))
    const scopedListings = managementTab === "mine" ? listings.filter((item) => item.seller === data.currentUser.name) : managementTab === "saved" ? listings.filter((item) => item.saved) : listings
    const filtered = activeFilter === "全部" ? scopedListings : scopedListings.filter((item) => item.category === activeFilter)
    currentPayload = listings
    viewRoot.innerHTML = `
      ${sectionHeading("CAMPUS SECOND LIFE", "二手集市 <span class=\"heading-emoji\">◇</span>", "让闲置在同校同学之间继续流转。商品、卖家与价格都是演示内容；当前不提供真实交易或支付。", newButton("发布闲置", "listing"))}
      ${managementTabs([["all", "商品广场"], ["mine", "我的发布"], ["saved", "我的收藏"], ["messages", "消息通知"]])}
      ${managementTab === "messages" ? messageList("market") : `<div class="market-toolbar"><div class="filter-tabs" role="group" aria-label="二手商品分类">${data.categories.map((category) => `<button type="button" data-action="filter" data-filter="${escapeHtml(category)}" class="${activeFilter === category ? "is-selected" : ""}">${escapeHtml(category)}</button>`).join("")}</div><span class="market-sort">${managementTab === "mine" ? "我的校园闲置" : managementTab === "saved" ? "已收藏商品" : "校内发布 · 最新上架"}</span></div>
      <div class="listing-grid">${filtered.length ? filtered.map(listingCard).join("") : `<div class="empty-state empty-wide"><span>◇</span><strong>${managementTab === "mine" ? "你还没有发布闲置" : managementTab === "saved" ? "你还没有收藏商品" : "还没有找到相关好物"}</strong><p>${managementTab === "mine" ? "发布闲置后可在这里查看和管理。" : managementTab === "saved" ? "收藏喜欢的物品后，会显示在这里。" : "换个分类或关键词试试，也可以发布一件闲置。"}</p></div>`}</div>`}
      <div class="market-safety"><span>✓</span><p><strong>友好交易提示</strong> 交易请谨慎核实物品情况，优先选择校内公共区域当面交接。页面仅为前端体验，不处理付款或退款。</p></div>`
  }

  const renderNotices = async () => {
    const notices = (await api.getNotices()).filter((notice) => matchesSearch(notice.title, notice.content, notice.category))
    currentPayload = notices
    updateNoticeCount(notices.filter((notice) => !notice.read).length)
    viewRoot.innerHTML = `
      ${sectionHeading("CAMPUS BULLETIN", "通知公告 <span class=\"heading-emoji\">▤</span>", "把校园里的重要消息放在一起，空出更多时间去做喜欢的事。")}
      <div class="notice-layout"><section class="notice-list-section"><div class="notice-overview"><span class="notice-overview-icon">▤</span><div><strong>校园公告栏</strong><small>信息为产品体验用的虚构示例，不代表真实学校通知。</small></div><span class="notice-count">${notices.filter((notice) => !notice.read).length} 条未读</span></div><div class="notice-list">${notices.length ? notices.map(noticeCard).join("") : '<div class="empty-state"><span>▤</span><strong>没有匹配的通知</strong><p>试试其他关键词。</p></div>'}</div></section><aside class="notice-sidebar"><div class="aside-panel notice-calendar"><p class="eyebrow">CAMPUS CALENDAR</p><h3>本周校园日历</h3><div class="calendar-event"><span><small>周五</small><strong>24</strong></span><p><strong>旧物交换日</strong><small>大学生活动中心 · 示例活动</small></p></div><div class="calendar-event"><span class="calendar-day-blue"><small>周日</small><strong>26</strong></span><p><strong>社团开放体验</strong><small>中心广场 · 示例活动</small></p></div><button class="text-button" type="button" data-action="calendar">查看完整日历 ↗</button></div><div class="aside-panel notice-tip"><span>✳</span><p><strong>信息小贴士</strong><br />涉及个人资料或费用的通知，请通过学校官方渠道核实。</p></div></aside></div>`
  }

  const renderForum = async () => {
    const threads = (await api.getForumThreads()).filter((thread) =>
      matchesSearch(thread.title, thread.content, thread.author, thread.category)
    )
    const filtered = activeFilter === "全部" ? threads : threads.filter((thread) => thread.category === activeFilter)
    currentPayload = threads
    viewRoot.innerHTML = `
      ${sectionHeading("CAMPUS FORUM", '校园论坛 <span class="heading-emoji">≋</span>', "聊学习、聊生活，也聊聊校园里正在发生的事。尊重彼此，不发布未经证实或涉及他人隐私的信息。", newButton("发起讨论", "thread"))}
      <section class="forum-banner"><div><span class="community-kicker">LET’S TALK ABOUT CAMPUS</span><h2>一个问题，也能开启<br />一场很好的讨论。</h2><p>向同校同学提问，分享经验，找到一起解决问题的人。</p></div><div class="forum-banner-art" aria-hidden="true"><span>?</span><i>≋</i></div></section>
      <div class="forum-toolbar"><div class="filter-tabs" role="group" aria-label="论坛分类">${data.forumCategories.map((category) => `<button type="button" data-action="filter" data-filter="${escapeHtml(category)}" class="${activeFilter === category ? "is-selected" : ""}">${escapeHtml(category)}</button>`).join("")}</div><span>${filtered.length} 个讨论</span></div>
      <div class="forum-layout"><section class="content-panel forum-thread-list">${filtered.length ? filtered.map((thread) => `<article class="forum-thread"><div class="thread-votes"><span>↑</span><strong>${escapeHtml(thread.likes)}</strong><small>喜欢</small></div><div class="thread-body"><div class="thread-labels">${thread.pinned ? '<span class="pinned-tag">推荐</span>' : ""}<span class="thread-category">${escapeHtml(thread.category)}</span></div><h3>${escapeHtml(thread.title)}</h3><p>${escapeHtml(thread.content)}</p><div class="thread-meta">${avatar(thread.avatar, "avatar-tiny")}<span>${escapeHtml(thread.author)} · ${escapeHtml(thread.department)} · ${escapeHtml(thread.time)}</span><span class="thread-replies">◷ ${escapeHtml(thread.replies)} 条回应</span></div></div></article>`).join("") : '<div class="empty-state"><span>≋</span><strong>还没有匹配的讨论</strong><p>换个分类，或开启一个新的话题。</p></div>'}</section><aside class="aside-panel forum-rules"><span class="guideline-icon">✳</span><p class="eyebrow">GOOD CONVERSATIONS</p><h3>讨论有边界，<br />表达有温度。</h3><p>内容和互动为体验示例。请避免发布隐私、未经核实的信息和不友善内容。</p><button class="text-button" type="button" data-action="guide">查看社区公约 ↗</button></aside></div>`
  }

  const renderFriends = async () => {
    const friends = (await api.getFriends()).filter((friend) =>
      matchesSearch(friend.name, friend.department, friend.bio, friend.interests.join(" "))
    )
    currentPayload = friends
    viewRoot.innerHTML = `
      ${sectionHeading("SAME CAMPUS, NEW CONNECTIONS", '同校连接 <span class="heading-emoji">♡</span>', "从共同的校园与兴趣开始，慢慢认识新朋友。此处为虚构资料体验页，不代表真实用户，也不提供真实聊天。")}
      <section class="friends-banner"><div><span class="community-kicker">MEET AROUND SHARED INTERESTS</span><h2>先从共同喜欢的事情开始。</h2><p>兴趣和校园话题，给每一次认识一个轻松的起点。</p></div><span class="friends-banner-mark" aria-hidden="true">♡</span></section>
      <div class="section-title-row friends-title"><div><p class="eyebrow">PEOPLE IN YOUR CAMPUS</p><h2>也在校园里的同学</h2></div><span class="section-side-note">演示资料 · 兴趣连接 · 尊重彼此</span></div>
      <div class="friend-grid">${friends.length ? friends.map((friend) => `<article class="friend-card"><div class="friend-card-top"><span class="friend-avatar">${escapeHtml(friend.avatar)}</span><span class="friend-presence ${friend.online ? "is-online" : ""}">${friend.online ? "体验在线" : "校园同学"}</span></div><h3>${escapeHtml(friend.name)}<small>${escapeHtml(friend.year)}</small></h3><p class="friend-school">${escapeHtml(friend.department)} · 示例大学</p><p class="friend-bio">${escapeHtml(friend.bio)}</p><div class="friend-interests">${friend.interests.map((interest) => `<span>${escapeHtml(interest)}</span>`).join("")}</div><div class="friend-actions"><button type="button" class="button button-outline button-tiny" data-action="friend-message" data-id="${escapeHtml(friend.id)}">打个招呼</button>${cardAction(friend.interested ? "感兴趣 ✓" : "认识一下", "friend-interest", friend.id, friend.interested ? "button button-joined button-tiny" : "button button-small")}</div></article>`).join("") : '<div class="empty-state empty-wide"><span>♡</span><strong>没找到相关同学</strong><p>试试兴趣关键词，发现新的校园连接。</p></div>'}</div>
      <div class="community-values"><span>♡</span><p><strong>连接从尊重开始。</strong> 演示用户资料为虚构内容。真实服务需取得用户授权后才会展示校园身份与兴趣资料。</p></div>`
  }

  const renderProfile = async () => {
    const profile = await api.getProfile()
    currentPayload = profile
    viewRoot.innerHTML = `
      <div class="profile-cover"><div class="cover-shape cover-shape-one"></div><div class="cover-shape cover-shape-two"></div><span class="cover-label">YOUR CAMPUS, YOUR STORY</span></div>
      <section class="profile-header"><span class="profile-avatar">${escapeHtml(profile.avatar)}</span><div class="profile-identity"><h1>${escapeHtml(profile.name)}${profile.verified ? '<span class="profile-verified">✓ 演示认证</span>' : ""}</h1><p>${escapeHtml(profile.school)} <i>·</i> ${escapeHtml(profile.department)} <i>·</i> ${escapeHtml(profile.year)}</p><small>${escapeHtml(profile.bio)}</small></div><button class="button button-outline" type="button" data-action="verify">${profile.verified ? "认证状态说明" : "体验身份认证"} <span>↗</span></button></section>
      <div class="profile-layout"><section class="profile-main"><div class="profile-stats"><div><strong>${profile.posts}</strong><span>发布动态</span></div><div><strong>${profile.orders}</strong><span>互助记录</span></div><div><strong>${profile.connections}</strong><span>同校意向</span></div><div><strong>${profile.saved.length}</strong><span>收藏好物</span></div></div><section class="content-panel profile-activity"><div class="panel-heading"><div><p class="eyebrow">YOUR CAMPUS LIFE</p><h2>我的互助记录</h2></div><a href="#/errands" class="inline-link">去看看需求 ↗</a></div>${profile.myOrders.length ? `<div class="profile-order-list">${profile.myOrders.map((order) => `<div class="profile-order"><span class="order-icon">↗</span><span><strong>${escapeHtml(order.title)}</strong><small>${escapeHtml(order.status)} · 仅本地演示</small></span></div>`).join("")}</div>` : '<div class="profile-empty"><span>✳</span><strong>每一次顺路，都是校园里的小小连接。</strong><p>你还没有互助记录，去看看有没有顺路的校园需求。</p><a href="#/errands">浏览跑腿需求 ↗</a></div>'}</section><section class="content-panel profile-favorites"><div class="panel-heading"><div><p class="eyebrow">SAVED FOR LATER</p><h2>我的收藏</h2></div><a href="#/market" class="inline-link">逛二手集市 ↗</a></div>${profile.saved.length ? `<div class="saved-inline">${profile.saved.map((item) => `<div>${avatar(item.emoji, "avatar-small")}<strong>${escapeHtml(item.title)}</strong><span>¥${escapeHtml(item.price)}</span></div>`).join("")}</div>` : '<p class="muted-paragraph">看到喜欢的校园好物，点击 ♡ 就能收藏在这里。</p>'}</section></section><aside class="profile-aside"><div class="aside-panel profile-trust"><span class="trust-symbol">✓</span><p class="eyebrow">CAMPUS IDENTITY</p><h3>${profile.verified ? "演示认证已完成" : "连接你的校园身份"}</h3><p>身份认证目前仅用于前端流程演示，不会连接学信网或学校身份系统，也不要输入真实学籍信息。</p><button type="button" class="button button-primary button-block" data-action="verify">${profile.verified ? "查看演示状态" : "开始体验"}</button></div><div class="aside-panel profile-settings"><h3>账户与隐私</h3><button type="button" data-action="privacy">隐私与数据说明 <span>↗</span></button><button type="button" data-action="reset">清除本地演示数据 <span>↗</span></button><small>当前浏览器本地保存，不会同步到服务器。</small></div></aside></div>`
  }

  const renderSaved = async () => {
    const profile = await api.getProfile()
    currentPayload = profile.saved
    viewRoot.innerHTML = `
      ${sectionHeading("YOUR SAVED ITEMS", "我的收藏 <span class=\"heading-emoji\">♡</span>", "把喜欢的校园好物先收好。收藏仅保存在当前浏览器的演示数据中。")}
      <div class="listing-grid">${profile.saved.length ? profile.saved.map(listingCard).join("") : '<div class="empty-state empty-wide"><span>♡</span><strong>还没有收藏好物</strong><p>去二手集市看看，遇到喜欢的物品可以点一下爱心。</p><a href="#/market" class="button button-primary">去逛逛集市 ↗</a></div>'}</div>`
  }

  const renderError = (error) => {
    console.error("[校园汇] 页面加载失败", error)
    viewRoot.innerHTML = `<section class="page-error"><span>!</span><h1>页面暂时没有加载成功</h1><p>${escapeHtml(error.message)}</p><button type="button" class="button button-primary" data-action="retry">重新加载</button></section>`
  }

  const routeRenderers = {
    home: renderHome,
    wall: renderWall,
    errands: renderErrands,
    market: renderMarket,
    notices: renderNotices,
    forum: renderForum,
    profile: renderProfile,
    saved: renderSaved,
  }

  const renderRoute = async () => {
    const hash = window.location.hash.replace(/^#\/?/, "")
    const route = hash.split("?")[0] || "home"
    const legacyForum = route === "forum"
    const legacyFriends = route === "friends"
    const sectionForum = hash.includes("section=forum")
    forumExpanded = legacyForum || sectionForum
    activeRoute = routeRenderers[route] ? route : "home"
    if (legacyForum || legacyFriends) activeRoute = "home"
    activeFilter = "全部"
    managementTab = "all"
    document.querySelector("#current-page-name").textContent = pageNames[activeRoute]
    document.querySelectorAll(".side-nav [data-route]").forEach((link) => {
      const active = link.dataset.route === activeRoute
      link.classList.toggle("is-active", active)
      if (active) link.setAttribute("aria-current", "page")
      else link.removeAttribute("aria-current")
    })
    document.querySelector("#sidebar").classList.remove("is-open")
    document.querySelector(".mobile-menu").setAttribute("aria-expanded", "false")
    window.scrollTo({ top: 0, behavior: "auto" })
    try {
      await routeRenderers[activeRoute]()
      renderTaskRail()
      if (legacyForum || sectionForum) document.querySelector("#campus-forum")?.scrollIntoView({ block: "start", behavior: "smooth" })
    } catch (error) {
      renderError(error)
    }
  }

  const openModal = (title, body) => {
    dialogContent.innerHTML = `<div class="dialog-eyebrow">CAMPUS HUI · 交互演示</div><h2 id="dialog-title">${title}</h2>${body}`
    dialog.showModal()
  }

  const openCreateDialog = (type) => {
    const forms = {
      post: `<form class="dialog-form" data-form="post"><label>发布到<select name="category">${data.wallCategories.filter((category) => category !== "全部").map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></label><label>说说你想分享的内容<textarea name="text" rows="5" minlength="5" maxlength="300" placeholder="友善表达，不要包含他人隐私信息…" required></textarea><small>5–300 字 · 发布内容仅保存于当前浏览器</small></label><button class="button button-primary button-block" type="submit">发布到校园墙</button></form>`,
      errand: `<form class="dialog-form" data-form="errand"><label>需求标题<input name="title" maxlength="50" placeholder="例如：帮忙取一下快递" required /></label><label>需求说明<textarea name="detail" rows="3" maxlength="180" placeholder="简单描述物品和交接方式" required></textarea></label><div class="form-row"><label>需求类型<select name="category">${data.errandsCategories.filter((category) => category !== "全部").map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></label><label>感谢费（演示）<input type="number" name="reward" min="0" max="99" step="1" value="3" required /></label></div><div class="form-row"><label>从哪里开始<input name="from" maxlength="35" placeholder="校园地点" required /></label><label>送到哪里<input name="to" maxlength="35" placeholder="校园地点" required /></label></div><p class="form-disclaimer">这是本地交互演示，不会生成真实订单、通知或支付。</p><button class="button button-primary button-block" type="submit">发布跑腿需求</button></form>`,
      listing: `<form class="dialog-form" data-form="listing"><label>物品名称<input name="title" maxlength="55" placeholder="例如：宿舍小台灯" required /></label><div class="form-row"><label>商品分类<select name="category">${data.categories.filter((category) => category !== "全部").map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></label><label>价格（演示）<input type="number" name="price" min="0" max="99999" step="1" placeholder="¥" required /></label></div><label>物品情况<input name="condition" maxlength="30" placeholder="例如：九成新" required /></label><p class="form-disclaimer">仅在本地展示虚构商品信息，不涉及真实交易或支付。</p><button class="button button-primary button-block" type="submit">发布闲置</button></form>`,
      thread: `<form class="dialog-form" data-form="thread"><label>讨论分类<select name="category">${data.forumCategories.filter((category) => category !== "全部").map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></label><label>讨论标题<input name="title" minlength="4" maxlength="60" placeholder="用一句话说说你想讨论什么" required /></label><label>补充说明<textarea name="content" rows="4" minlength="5" maxlength="300" placeholder="写下问题或背景，方便同学参与讨论" required></textarea></label><p class="form-disclaimer">讨论内容只保存在当前浏览器的本地演示数据中。</p><button class="button button-primary button-block" type="submit">发布讨论</button></form>`,
    }
    const titles = { post: "分享校园新鲜事", errand: "发布一个跑腿需求", listing: "发布一件校园闲置" }
    titles.thread = "发起一个校园讨论"
    openModal(titles[type] || "创建内容", forms[type] || "")
  }

  const openVerifyDialog = async () => {
    let verified = false
    try {
      verified = (await api.getProfile()).verified
    } catch (error) {
      showError(error)
      return
    }
    const body = `<div class="verify-panel"><span class="verify-big-icon">${verified ? "✓" : "⌑"}</span><h3>${verified ? "当前浏览器已开启演示认证状态" : "体验校园身份认证流程"}</h3><p>本页面不连接学信网或任何学校身份系统。请勿输入真实姓名、学号、证件号或密码。点击下方按钮仅会在当前浏览器中切换演示状态。</p><div class="verify-steps"><span><i>1</i> 选择校内身份</span><span><i>2</i> 阅读隐私说明</span><span><i>3</i> 完成本地演示</span></div><button type="button" class="button ${verified ? "button-outline" : "button-primary"} button-block" data-action="${verified ? "verify-reset" : "verify-demo"}">${verified ? "关闭演示认证状态" : "我已了解，继续体验"}</button></div>`
    openModal("身份认证", body)
  }

  const openGuide = () =>
    openModal("校园汇社区友好指南", `<div class="guide-content"><p>校园汇希望成为真实、友善、有帮助的同校交流空间。当前站内内容都是演示数据。</p><ul><li>尊重他人，不发布未经同意的个人隐私或联系方式。</li><li>不传播未经证实的消息，不发布骚扰、歧视或违法内容。</li><li>交易或线下交接请谨慎核实，优先选择开放公共区域。</li><li>遇到不友善内容，可先暂停互动并通过正式反馈渠道处理。</li></ul><button type="button" class="button button-primary button-block" data-action="close-dialog">知道了</button></div>`)

  const openInformation = (kind) => {
    const messages = {
      privacy: ["隐私与数据说明", "本演示产品不收集真实身份信息。你在页面创建的动态、收藏、接单状态和认证体验状态仅存储在当前浏览器的 localStorage。清除浏览器站点数据或使用下方清理操作即可删除。"],
      campus: ["校园空间选择", "当前展示的是“示例大学”体验空间，学校、校园内容和服务数据均为虚构示例。正式上线后，校园列表、学校身份认证与数据权限由后端服务提供。"],
      calendar: ["校园日历", "当前展示的活动为体验用示例。正式产品可由学校或校园运营团队发布并维护活动信息。"],
      comment: ["动态回应", "评论功能尚未接入后端服务。当前页面不会发送评论或通知。"],
      share: ["分享校园动态", "这是体验内容。复制页面链接可以分享校园汇演示网站，暂不支持分享真实校园内容。"],
      more: ["内容反馈", "如果在真实服务中遇到不友善或不实内容，请使用平台反馈入口。当前演示不会发送举报或联系运营人员。"],
    }
    const [title, text] = messages[kind] || messages.privacy
    openModal(title, `<div class="guide-content"><p>${escapeHtml(text)}</p><button type="button" class="button button-primary button-block" data-action="close-dialog">关闭</button></div>`)
  }

  const onSubmit = async (event) => {
    const form = event.target.closest("form[data-form]")
    if (!form) return
    event.preventDefault()
    const values = Object.fromEntries(new FormData(form).entries())
    try {
      if (form.dataset.form === "post") {
        await api.createPost({ category: values.category, text: values.text.trim() })
        activeRoute = "wall"
        window.location.hash = "#/wall"
        dialog.close()
        await renderRoute()
        flash("已发布到本地演示校园墙。")
      } else if (form.dataset.form === "errand") {
        await api.createErrand({ ...values, reward: Number(values.reward) })
        activeRoute = "errands"
        window.location.hash = "#/errands"
        dialog.close()
        await renderRoute()
        flash("需求已添加到本地演示列表。")
      } else if (form.dataset.form === "listing") {
        await api.createListing({ ...values, price: Number(values.price) })
        activeRoute = "market"
        window.location.hash = "#/market"
        dialog.close()
        await renderRoute()
        flash("闲置已添加到本地演示集市。")
      } else if (form.dataset.form === "thread") {
        await api.createForumThread({ ...values, title: values.title.trim(), content: values.content.trim() })
        activeRoute = "home"
        forumExpanded = true
        window.location.hash = "#/home?section=forum"
        dialog.close()
        await renderRoute()
        flash("讨论已添加到本地演示论坛。")
      }
    } catch (error) {
      showError(error)
    }
  }

  const onAction = async (event) => {
    const button = event.target.closest("[data-action], [data-route-link]")
    if (!button) {
      if (event.target.closest(".toast button")) toastRegion.innerHTML = ""
      return
    }
    if (button.dataset.routeLink) {
      window.location.hash = `#/${button.dataset.routeLink}`
      return
    }
    const { action, id, filter, type } = button.dataset
    try {
      if (action === "menu") {
        const open = document.querySelector("#sidebar").classList.toggle("is-open")
        button.setAttribute("aria-expanded", String(open))
      } else if (action === "close-menu") {
        document.querySelector("#sidebar").classList.remove("is-open")
        document.querySelector(".mobile-menu").setAttribute("aria-expanded", "false")
      } else if (action === "toggle-nav") {
        navCollapsed = !navCollapsed
        persistNavigation()
      } else if (action === "close-tasks") {
        if (tasksVisible) setTasksVisible(false)
      } else if (action === "profile-drawer") {
        openProfileDrawer(button)
      } else if (action === "close-profile") {
        closeProfileDrawer()
      } else if (action === "toggle-tasks") {
        setTasksVisible(!tasksVisible, button)
      } else if (action === "toggle-homework") {
        const task = data.homework.find((item) => item.id === id)
        if (!task) throw new Error("未找到该作业任务。")
        task.done = !task.done
        try {
          localStorage.setItem("campus-hui-homework", JSON.stringify(data.homework.filter((item) => item.done).map((item) => item.id)))
        } catch (error) {
          showError(new Error(`无法保存作业状态：${error.message}`))
        }
        renderTaskRail()
      } else if (action === "management-tab") {
        managementTab = button.dataset.tab
        activeFilter = "全部"
        await routeRenderers[activeRoute]()
      } else if (action === "forum-category") {
        forumExpanded = true
        await renderHome()
      } else if (action === "new") {
        openCreateDialog(type)
      } else if (action === "filter") {
        activeFilter = filter
        await routeRenderers[activeRoute]()
      } else if (action === "feed-filter") {
        const feedButtons = document.querySelectorAll(".feed-tabs button")
        feedButtons.forEach((item) => item.classList.toggle("is-selected", item === button))
        const posts = (currentPayload?.posts || []).filter((post) =>
          filter === "推荐" ? true : filter === "求助互助" ? post.category === "求助互助" : post.category === filter
        )
        document.querySelector(".feed-panel .post-list").innerHTML = posts.length ? posts.map(postCard).join("") : '<div class="empty-inline">这个分类暂时还没有动态</div>'
      } else if (action === "like") {
        await api.toggleLike(id)
        await routeRenderers[activeRoute]()
      } else if (action === "claim") {
        await api.claimErrand(id)
        await routeRenderers[activeRoute]()
        flash("已在本地登记演示接单状态，不会产生真实订单。")
      } else if (action === "favorite") {
        await api.toggleFavorite(id)
        await routeRenderers[activeRoute]()
        flash("收藏状态已保存在当前浏览器。")
      } else if (action === "mark-read") {
        await api.markNoticeRead(id)
        await routeRenderers[activeRoute]()
        flash("通知已标记为已读。")
      } else if (action === "friend-interest") {
        await api.toggleFriendInterest(id)
        await routeRenderers.friends()
        flash("已更新本地演示兴趣状态。")
      } else if (action === "friend-message") {
        openModal("校园私信", `<div class="guide-content"><p>当前版本还没有连接真实用户或私信服务。未来可以在双方授权后接入校内聊天与消息通知。</p><button type="button" class="button button-primary button-block" data-action="close-dialog">知道了</button></div>`)
      } else if (action === "verify") {
        await openVerifyDialog()
      } else if (action === "verify-demo" || action === "verify-reset") {
        if (action === "verify-demo") await api.verify({ school: data.currentUser.school, studentId: "DEMO-ONLY" })
        else {
          await api.resetVerification()
        }
        dialog.close()
        await routeRenderers[activeRoute]()
        flash("演示认证状态已更新；未验证真实身份。")
      } else if (action === "contact-seller") {
        const listing = currentPayload.find((item) => item.id === id)
        openModal("联系卖家", `<div class="seller-contact"><span class="seller-contact-avatar">${escapeHtml(listing?.avatar || "同")}</span><div><strong>${escapeHtml(listing?.seller || "校园同学")}</strong><small>${escapeHtml(listing?.location || "校内交接 · 示例")}</small></div></div><div class="local-contact-note"><strong>校内沟通暂未接入</strong><p>目前不会联系到真实卖家。这个位置保留给未来的校内聊天和交易沟通接口。</p></div><button type="button" class="button button-primary button-block" data-action="close-dialog">知道了</button>`)
      } else if (action === "comment") {
        openInformation("comment")
      } else if (action === "share") {
        openInformation("share")
      } else if (action === "post-more") {
        openInformation("more")
      } else if (action === "campus-switch") {
        openInformation("campus")
      } else if (action === "guide") {
        openGuide()
      } else if (action === "calendar") {
        openInformation("calendar")
      } else if (action === "saved") {
        window.location.hash = "#/saved"
      } else if (action === "retry") {
        await routeRenderers[activeRoute]()
      } else if (action === "close-dialog") {
        dialog.close()
      } else if (action === "dismiss-banner") {
        document.querySelector(".demo-banner")?.remove()
      } else if (action === "reset") {
        openModal("清除本地演示数据", `<div class="guide-content"><p>这会移除当前浏览器保存的示例动态、收藏、加入状态和接单记录，并恢复初始演示数据。不会影响其他设备或真实账户。</p><div class="dialog-actions"><button type="button" class="button button-outline" data-action="close-dialog">取消</button><button type="button" class="button button-danger" data-action="confirm-reset">清除本地数据</button></div></div>`)
      } else if (action === "confirm-reset") {
        await api.resetDemoData()
        data.homework.forEach((task) => {
          task.done = false
        })
        tasksVisible = true
        navCollapsed = false
        try {
          localStorage.removeItem("campus-hui-nav-collapsed")
        } catch (error) {
          showError(new Error(`无法重置导航栏状态：${error.message}`))
        }
        dialog.close()
        persistNavigation()
        renderTaskRail()
        await routeRenderers[activeRoute]()
        flash("当前浏览器的演示数据已重置。")
      } else if (action === "sort-wall") {
        flash("校园墙当前按演示数据中的发布时间展示。", "info")
      }
    } catch (error) {
      showError(error)
    }
  }

  document.addEventListener("click", onAction)
  document.querySelector("#sidebar").addEventListener("pointerenter", () => {
    if (navCollapsed) document.querySelector(".app-frame").classList.add("is-nav-peek")
  })
  document.querySelector("#sidebar").addEventListener("pointerleave", () => {
    document.querySelector(".app-frame").classList.remove("is-nav-peek")
  })
  document.querySelector("#sidebar").addEventListener("focusin", () => {
    if (navCollapsed) document.querySelector(".app-frame").classList.add("is-nav-peek")
  })
  document.querySelector("#sidebar").addEventListener("focusout", (event) => {
    if (navCollapsed && !event.currentTarget.contains(event.relatedTarget)) {
      document.querySelector(".app-frame").classList.remove("is-nav-peek")
    }
  })
  document.querySelector("#sidebar").addEventListener("click", (event) => {
    if (!event.target.closest(".side-nav [data-route]") || !navCollapsed) return
    navCollapsed = false
    persistNavigation()
  })
  dialog.addEventListener("submit", onSubmit)
  window.addEventListener("hashchange", renderRoute)
  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.trim()
    routeRenderers[activeRoute]().catch(showError)
  })
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      searchInput.focus()
    }
    if (event.key === "Escape") {
      document.querySelector("#sidebar").classList.remove("is-open")
      if (document.querySelector("#profile-drawer").classList.contains("is-open")) {
        closeProfileDrawer()
      } else if (tasksVisible) {
        setTasksVisible(false)
      }
    }
  })

  const searchQuery = new URLSearchParams(window.location.search).get("q")
  if (searchQuery) {
    searchInput.value = searchQuery
    searchTerm = searchQuery
    window.history.replaceState(null, "", window.location.pathname + window.location.hash)
  }
  document.querySelector(".demo-banner strong").textContent = api.isDemo ? "校园体验空间" : "校园汇"
  renderNavigation()
  renderTaskRail()
  renderRoute()
})()
