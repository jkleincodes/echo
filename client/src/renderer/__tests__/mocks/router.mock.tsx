import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';

interface RouterRenderOptions extends RenderOptions {
  routerProps?: MemoryRouterProps;
}

export function renderWithRouter(
  ui: React.ReactElement,
  options: RouterRenderOptions = {},
) {
  const { routerProps, ...renderOptions } = options;
  return render(
    <MemoryRouter {...routerProps}>{ui}</MemoryRouter>,
    renderOptions,
  );
}
