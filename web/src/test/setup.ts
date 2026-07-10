/**
 * Vitest — fichier de setup global.
 *
 * Active les matchers de jest-dom (toBeInTheDocument, toHaveTextContent, etc.)
 * et nettoie jsdom entre chaque test.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
    cleanup();
});
