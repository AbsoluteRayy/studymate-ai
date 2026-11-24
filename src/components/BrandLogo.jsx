import { useId } from "react";

function BrandLogo({ size = 23, mode = "database" }) {
  const gradId = useId();
  const isGeneral = mode === "general";

  return (
    <svg
      key={mode}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="12%" y1="12%" x2="88%" y2="88%">
          {isGeneral ? (
            <>
              <stop offset="0%" stopColor="#FDE08D" />
              <stop offset="48%" stopColor="#FB923C" />
              <stop offset="100%" stopColor="#F45D79" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#DDD6FE" />
              <stop offset="48%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#6366F1" />
            </>
          )}
        </linearGradient>
      </defs>
      <path
        d="M50 2L59.5 34.5L86 14L65.5 40.5L98 50L65.5 59.5L86 86L59.5 65.5L50 98L40.5 65.5L14 86L34.5 59.5L2 50L34.5 40.5L14 14L40.5 34.5L50 2Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
}

export default BrandLogo;