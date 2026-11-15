/**
 * Kontrola, že právní text není koncept (šablona s poznámkami a doplňovanými údaji).
 * Stejná pravidla jako app/scripts/build-legal.mjs pro obecné stránky platformy. Odkazy v Markdownu
 * ([ÚOOÚ](https://…)) nejsou doplňované údaje.
 */
export function legalDraftProblems(text: string): string[] {
  const problems: string[] = [];
  const notes = text.match(/PRACOVNÍ NÁVRH|K ověření právníkem|Pro kliniku:|Pro Provozovnu:|Pro Nexum Care:/gi);
  if (notes) problems.push(`poznámky konceptu (${[...new Set(notes)].slice(0, 3).join(', ')})`);
  const placeholders = text.match(/\[(?:VARIANTA|MODUL)[^\]]*\](?!\()|\[[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ0-9 …,./-]{2,}\](?!\()/g);
  if (placeholders) problems.push(`nevyplněné údaje (${[...new Set(placeholders)].slice(0, 4).join(', ')})`);
  return problems;
}
