/**
 * Portal route loading skeleton.
 * Shown by Next.js App Router while portal page components are loading.
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

function CardSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "24px",
        marginBottom: "24px",
      }}
    >
      {children}
    </div>
  );
}

export default function PortalLoading() {
  return (
    <div
      style={{
        padding: "32px 24px",
        maxWidth: "860px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header skeleton */}
      <div style={{ marginBottom: "28px" }}>
        <SkeletonBlock width="220px" height="28px" />
        <div style={{ marginTop: "8px" }}>
          <SkeletonBlock width="180px" height="14px" />
        </div>
        <div style={{ marginTop: "14px" }}>
          <SkeletonBlock width="220px" height="36px" />
        </div>
      </div>

      {/* Active Plan skeleton */}
      <CardSkeleton>
        <SkeletonBlock width="120px" height="18px" />
        <div style={{ marginTop: "14px" }}>
          <SkeletonBlock width="60%" height="22px" />
        </div>
        <div style={{ marginTop: "10px", display: "flex", gap: "12px" }}>
          <SkeletonBlock width="100px" height="14px" />
          <SkeletonBlock width="100px" height="14px" />
        </div>
        <div
          style={{
            marginTop: "18px",
            display: "flex",
            gap: "10px",
            padding: "16px",
            background: "#f8fafc",
            borderRadius: "10px",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <SkeletonBlock height="24px" />
              <div style={{ marginTop: "6px" }}>
                <SkeletonBlock width="60%" height="12px" />
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  background: "#f8fafc",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <SkeletonBlock width="80px" height="16px" />
                <SkeletonBlock width="120px" height="14px" />
              </div>
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <SkeletonBlock height="14px" />
                <SkeletonBlock height="14px" />
              </div>
            </div>
          ))}
        </div>
      </CardSkeleton>

      {/* Check-in skeleton */}
      <CardSkeleton>
        <SkeletonBlock width="100px" height="18px" />
        <div style={{ marginTop: "14px" }}>
          <SkeletonBlock height="64px" />
        </div>
      </CardSkeleton>

      {/* Stats skeleton */}
      <CardSkeleton>
        <SkeletonBlock width="160px" height="18px" />
        <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                padding: "16px",
                background: "#f8fafc",
                borderRadius: "10px",
                textAlign: "center",
              }}
            >
              <SkeletonBlock width="60%" height="22px" />
              <div style={{ marginTop: "6px" }}>
                <SkeletonBlock width="80%" height="12px" />
              </div>
            </div>
          ))}
        </div>
      </CardSkeleton>
    </div>
  );
}
