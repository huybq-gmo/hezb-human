export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-label="Đang tải trang">
      <div className="topbar">
        <div className="skeleton h-6 w-44" />
      </div>
      <main id="main-content" className="page-content">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="card p-5 grid gap-3">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="card p-5 grid gap-5">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="skeleton h-9 w-full" />
          ))}
        </div>
        <p className="sr-only" role="status">
          Đang tải dữ liệu…
        </p>
      </main>
    </div>
  )
}
