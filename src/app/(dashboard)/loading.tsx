/**
 * Dashboard route loading skeleton.
 * Shown by Next.js App Router while (dashboard) page components are loading.
 */

function SkeletonBlock({ width, height }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        width: width ?? "100%",
        height: height ?? "18px",
        backgroundColor: "#e5e7eb",
        borderRadius: "6px",
      }}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1400px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header skeleton */}
      <div style={{ marginBottom: "28px" }}>
        <SkeletonBlock width="200px" height="28px" />
        <div style={{ marginTop: "8px" }}>
          <SkeletonBlock width="280px" height="16px" />
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "32px",
          flexWrap: "wrap",
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              flex: "1 1 180px",
              minWidth: "180px",
              padding: "20px 24px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
            }}
          >
            <SkeletonBlock width="60%" height="14px" />
            <div style={{ marginTop: "12px" }}>
              <SkeletonBlock width="45%" height="32px" />
            </div>
          </div>
        ))}
      </div>

      {/* Alerts skeleton */}
      <div style={{ marginBottom: "32px" }}>
        <SkeletonBlock width="80px" height="20px" />
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                padding: "14px 18px",
                background: "#f9fafb",
                borderLeft: "4px solid #e5e7eb",
                borderRadius: "8px",
              }}
            >
              <SkeletonBlock width="65%" height="14px" />
              <div style={{ marginTop: "6px" }}>
                <SkeletonBlock width="40%" height="12px" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom grid skeleton */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "24px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <SkeletonBlock width="160px" height="18px" />
          <div style={{ marginTop: "20px", height: "180px", display: "flex", alignItems: "flex-end", gap: "8px" }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  backgroundColor: "#e5e7eb",
                  borderRadius: "4px 4px 0 0",
                  height: `${30 + (i % 4) * 25}px`,
                }}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <SkeletonBlock width="120px" height="18px" />
          <div style={{ marginTop: "20px" }}>
            <SkeletonBlock height="32px" />
            <div style={{ marginTop: "16px", display: "flex", gap: "16px", justifyContent: "center" }}>
              <SkeletonBlock width="70px" height="14px" />
              <SkeletonBlock width="70px" height="14px" />
              <SkeletonBlock width="70px" height="14px" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
