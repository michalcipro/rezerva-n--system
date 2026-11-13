/** Import souborů jako textu (Vite ?raw) – SQL migrace v testech. */
declare module '*.sql?raw' {
  const content: string;
  export default content;
}
