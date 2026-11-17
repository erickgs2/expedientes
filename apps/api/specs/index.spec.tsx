/**
 * @jest-environment jsdom
 */
// Renders a React page, so it needs a DOM; the rest of the API's tests run in Node.
import React from 'react';
import { render } from '@testing-library/react';
import Page from '../src/app/page';

describe('Page', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<Page />);
    expect(baseElement).toBeTruthy();
  });
});
