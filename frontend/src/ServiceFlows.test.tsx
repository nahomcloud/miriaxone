import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ServiceFlowRouter from './ServiceFlows';

afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks()});

function renderShip(initialEntry='/ship'){
  render(<MemoryRouter initialEntries={[initialEntry]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes><Route path="/ship" element={<ServiceFlowRouter/>}/></Routes></MemoryRouter>);
}

it('changes service flow immediately when a service card changes only the query string',()=>{
  renderShip();
  expect(screen.getByRole('heading',{name:'What are you sending?'})).toBeTruthy();
  fireEvent.click(screen.getByRole('link',{name:/Send gift/}));
  expect(screen.getByRole('heading',{name:'Send love, same day.'})).toBeTruthy();
  expect(screen.queryByRole('heading',{name:'What are you sending?'})).toBeNull();
});

it('opens the requested service from the query string on first render',()=>{
  renderShip('/ship?service=custom-cargo');
  expect(screen.getByRole('heading',{name:'Quote anything from LCL to a 40-foot container.'})).toBeTruthy();
});
