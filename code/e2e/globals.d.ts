// Variable posée par les charges utiles des tests d'injection (XSS) : elle doit rester absente
declare global {
  interface Window {
    xss?: unknown
  }
}

export {}
