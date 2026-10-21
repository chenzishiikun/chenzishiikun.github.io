window.CampusAPI = (() => {
  const storageKey = "campus-hui-demo-v1"
  const configuredBase = window.CAMPUS_API_BASE_URL || ""

  const initialState = () => ({
    posts: structuredClone(window.CampusData.posts),
    errands: structuredClone(window.CampusData.errands),
    listings: structuredClone(window.CampusData.listings),
    notices: structuredClone(window.CampusData.notices),
    forumThreads: structuredClone(window.CampusData.forumThreads),
    interestedFriends: [],
    myOrders: [],
    verified: false,
  })

  const readState = () => {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return initialState()
    try {
      return { ...initialState(), ...JSON.parse(saved) }
    } catch (error) {
      throw new Error(`本地演示数据无法读取：${error.message}`)
    }
  }

  const writeState = (state) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch (error) {
      throw new Error(`无法保存演示数据到本地浏览器：${error.message}`)
    }
    return state
  }

  const mockRequest = (path, options = {}) => {
    const state = readState()
    const body = options.body || {}
    if (path === "/home") {
      const unreadCount = state.notices.filter((notice) => !notice.read).length
      return {
        posts: state.posts.slice(0, 4),
        errands: state.errands.slice(0, 3),
        listings: state.listings.slice(0, 4),
        notices: state.notices.slice(0, 3),
        unreadCount,
        verified: state.verified,
      }
    }
    if (options.method !== "POST" && (path === "/posts" || path === "/posts?scope=wall")) return state.posts
    if (options.method !== "POST" && path === "/errands") return state.errands
    if (options.method !== "POST" && path === "/listings") return state.listings
    if (options.method !== "POST" && path === "/notices") return state.notices
    if (options.method !== "POST" && path === "/forum/threads") return state.forumThreads
    if (options.method !== "POST" && path === "/friends") return window.CampusData.friends.map((friend) => ({ ...friend, interested: state.interestedFriends.includes(friend.id) }))
    if (options.method !== "POST" && path === "/profile") {
      return {
        ...window.CampusData.currentUser,
        verified: state.verified,
        posts: state.posts.filter((post) => post.author === window.CampusData.currentUser.name).length,
        orders: state.myOrders.length,
        connections: state.interestedFriends.length,
        myOrders: state.myOrders,
        saved: state.listings.filter((listing) => listing.saved),
      }
    }
    if (path === "/posts" && options.method === "POST") {
      const post = { ...body, id: `p-${Date.now()}`, author: window.CampusData.currentUser.name, avatar: window.CampusData.currentUser.avatar, department: `${window.CampusData.currentUser.department} · ${window.CampusData.currentUser.year}`, time: "刚刚", likes: 0, comments: 0, liked: false, verified: state.verified }
      state.posts.unshift(post)
      writeState(state)
      return post
    }
    const postMatch = path.match(/^\/posts\/([^/]+)\/like$/)
    if (postMatch && options.method === "POST") {
      const post = state.posts.find((item) => item.id === postMatch[1])
      if (!post) throw new Error("这条校园动态不存在或已被移除。")
      post.liked = !post.liked
      post.likes += post.liked ? 1 : -1
      writeState(state)
      return post
    }
    if (path === "/errands" && options.method === "POST") {
      const errand = { ...body, id: `e-${Date.now()}`, author: window.CampusData.currentUser.name, avatar: window.CampusData.currentUser.avatar, time: "刚刚", status: "待接单", verified: state.verified }
      state.errands.unshift(errand)
      writeState(state)
      return errand
    }
    const claimMatch = path.match(/^\/errands\/([^/]+)\/claim$/)
    if (claimMatch && options.method === "POST") {
      const errand = state.errands.find((item) => item.id === claimMatch[1])
      if (!errand) throw new Error("这条跑腿需求不存在或已被移除。")
      if (errand.status !== "待接单") throw new Error("这条需求已经有同学接单啦。")
      errand.status = "已接单 · 演示"
      state.myOrders.unshift({ id: errand.id, title: errand.title, status: errand.status })
      writeState(state)
      return errand
    }
    if (path === "/listings" && options.method === "POST") {
      const listing = { ...body, id: `m-${Date.now()}`, seller: window.CampusData.currentUser.name, avatar: window.CampusData.currentUser.avatar, location: "校内当面交接 · 演示", posted: "刚刚", saved: false, originalPrice: null, color: "plant-cover", emoji: "◇" }
      state.listings.unshift(listing)
      writeState(state)
      return listing
    }
    const favoriteMatch = path.match(/^\/listings\/([^/]+)\/favorite$/)
    if (favoriteMatch && options.method === "POST") {
      const listing = state.listings.find((item) => item.id === favoriteMatch[1])
      if (!listing) throw new Error("这个商品不存在或已被移除。")
      listing.saved = !listing.saved
      writeState(state)
      return listing
    }
    const noticeMatch = path.match(/^\/notices\/([^/]+)\/read$/)
    if (noticeMatch && options.method === "POST") {
      const notice = state.notices.find((item) => item.id === noticeMatch[1])
      if (!notice) throw new Error("这条通知不存在。")
      notice.read = true
      writeState(state)
      return notice
    }
    if (path === "/forum/threads" && options.method === "POST") {
      const thread = {
        ...body,
        id: `f-${Date.now()}`,
        author: window.CampusData.currentUser.name,
        avatar: window.CampusData.currentUser.avatar,
        department: `${window.CampusData.currentUser.department} · ${window.CampusData.currentUser.year}`,
        time: "刚刚",
        replies: 0,
        likes: 0,
        pinned: false,
      }
      state.forumThreads.unshift(thread)
      writeState(state)
      return thread
    }
    const friendInterestMatch = path.match(/^\/friends\/([^/]+)\/interest$/)
    if (friendInterestMatch && options.method === "POST") {
      const id = friendInterestMatch[1]
      state.interestedFriends = state.interestedFriends.includes(id)
        ? state.interestedFriends.filter((friendId) => friendId !== id)
        : [...state.interestedFriends, id]
      writeState(state)
      return state.interestedFriends
    }
    if (path === "/auth/verify" && options.method === "POST") {
      if (!body.studentId || !body.school) throw new Error("请填写学校和学号，才能继续体验认证流程。")
      state.verified = true
      writeState(state)
      return { verified: true, mode: "demo" }
    }
    if (path === "/auth/verify/reset" && options.method === "POST") {
      state.verified = false
      writeState(state)
      return { verified: false, mode: "demo" }
    }
    throw new Error(`演示接口暂不支持此操作：${options.method || "GET"} ${path}`)
  }

  const request = async (path, options = {}) => {
    if (!configuredBase) return mockRequest(path, options)
    const response = await fetch(`${configuredBase.replace(/\/$/, "")}${path}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "include",
    })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(`接口请求失败 (${response.status})：${message || response.statusText}`)
    }
    if (response.status === 204) return null
    return response.json()
  }

  return {
    isDemo: !configuredBase,
    resetDemoData: () => {
      if (configuredBase) throw new Error("已连接服务端时不能清除服务端数据。")
      localStorage.removeItem(storageKey)
      localStorage.removeItem("campus-hui-tasks-visible")
      localStorage.removeItem("campus-hui-homework")
      return true
    },
    resetVerification: () => request("/auth/verify/reset", { method: "POST" }),
    getHome: () => request("/home"),
    getPosts: () => request("/posts?scope=wall"),
    createPost: (data) => request("/posts", { method: "POST", body: data }),
    toggleLike: (id) => request(`/posts/${encodeURIComponent(id)}/like`, { method: "POST" }),
    getErrands: () => request("/errands"),
    createErrand: (data) => request("/errands", { method: "POST", body: data }),
    claimErrand: (id) => request(`/errands/${encodeURIComponent(id)}/claim`, { method: "POST" }),
    getListings: () => request("/listings"),
    createListing: (data) => request("/listings", { method: "POST", body: data }),
    toggleFavorite: (id) => request(`/listings/${encodeURIComponent(id)}/favorite`, { method: "POST" }),
    getNotices: () => request("/notices"),
    markNoticeRead: (id) => request(`/notices/${encodeURIComponent(id)}/read`, { method: "POST" }),
    getForumThreads: () => request("/forum/threads"),
    createForumThread: (data) => request("/forum/threads", { method: "POST", body: data }),
    getFriends: () => request("/friends"),
    toggleFriendInterest: (id) => request(`/friends/${encodeURIComponent(id)}/interest`, { method: "POST" }),
    getProfile: () => request("/profile"),
    verify: (data) => request("/auth/verify", { method: "POST", body: data }),
  }
})()
