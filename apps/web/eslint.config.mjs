import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Una directiva eslint-disable que ya no hace falta también falla el lint:
    // así las excepciones no se quedan obsoletas.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    // Reglas del React Compiler en 'error' (BL-012). Las pocas excepciones
    // justificadas (sincronizar con la URL, valores de cliente tras montar y
    // falsos positivos) llevan su eslint-disable-next-line con el motivo.
    rules: {
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
    },
  },
];

export default eslintConfig;
