// The M:orph mark: a blocky M with the colon in its notch. It is drawn with the surrounding text colour, so it
// stays legible and calm in all three themes instead of introducing a colour of its own.
export function BrandMark({
  height = 18,
  className = '',
}: {
  height?: number
  className?: string
}) {
  return (
    <svg
      className={'brand-mark ' + className}
      viewBox="-24 -24 825 672"
      height={height}
      width={(height * 825) / 672}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor" stroke="currentColor" strokeWidth="5" strokeLinejoin="round">
        <path d="M0 0H242V124H334V233H442V124H534V0H777V624H582V280H517V387H258V280H194V624H0Z" />
        <rect x="266" y="445" width="88" height="88" rx="12" />
        <rect x="422" y="445" width="88" height="88" rx="12" />
      </g>
    </svg>
  )
}
