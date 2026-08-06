export const ExternalLinkRedirect = ({ url, platform }) => {
  useEffect(() => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [url])

  return (
    <div className="not-prose my-6 rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        正在新标签页打开 {platform} 官方教程…
      </p>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        若浏览器拦截弹窗，请手动点击下方链接。
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      >
        打开八爪鱼帮助中心：{platform} MCP 对接教程 →
      </a>
    </div>
  )
}
