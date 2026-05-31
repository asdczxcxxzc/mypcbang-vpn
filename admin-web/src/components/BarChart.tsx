// 의존성 없는 순수 CSS 막대 그래프
export default function BarChart({
  data,
  height = 160,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        height,
        padding: '10px 0',
      }}
    >
      {data.map((d, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
          }}
          title={`${d.label}: ${d.value}`}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              height: 14,
            }}
          >
            {d.value > 0 ? d.value : ''}
          </div>
          <div
            style={{
              width: '100%',
              maxWidth: 34,
              height: `${(d.value / max) * (height - 50)}px`,
              minHeight: 2,
              background:
                'linear-gradient(180deg, var(--brand), var(--brand-dim))',
              borderRadius: '6px 6px 0 0',
              transition: 'height 0.4s ease',
            }}
          />
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {d.label}
          </div>
        </div>
      ))}
    </div>
  );
}
