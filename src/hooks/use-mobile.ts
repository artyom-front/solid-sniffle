import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // useSyncExternalStore вместо setState-в-эффекте: подписка на
  // matchMedia — внешний источник, состояние читается через снапшот.
  // Серверный снапшот false: до гидратации считаем десктопом.
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
