import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OneHome from './OneHome';

afterEach(()=>cleanup());

it('keeps the homepage focused on one service choice path',()=>{
  render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><OneHome/></MemoryRouter>);
  expect(screen.getByRole('heading',{name:'Move what matters.'})).toBeTruthy();
  expect(screen.getByRole('link',{name:/Choose a service/}).getAttribute('href')).toBe('/ship');
  expect(screen.getByRole('link',{name:/Build barrel/}).getAttribute('href')).toBe('/ship?service=ship-barrel');
  expect(screen.getByRole('link',{name:/Send gift/}).getAttribute('href')).toBe('/ship?service=express-gifts');
  expect(screen.getByRole('link',{name:/Request quote/}).getAttribute('href')).toBe('/ship?service=custom-cargo');
  expect(screen.queryByText('Choose a route and see what is open.')).toBeNull();
});

it('removes repeated service-card noise from the homepage',()=>{
  render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><OneHome/></MemoryRouter>);
  expect(screen.queryByText('Small family barrel')).toBeNull();
  expect(screen.queryByText('Care box')).toBeNull();
  expect(screen.queryByText('Core services')).toBeNull();
});
