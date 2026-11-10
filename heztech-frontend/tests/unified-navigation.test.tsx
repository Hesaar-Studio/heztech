import {it,expect} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {Sidebar} from '../src/components/layout/Sidebar';
import {useLocale} from '../src/hooks/useLocale';
function Subject(){const {labels}=useLocale();return <Sidebar labels={labels} collapsed={false} onToggle={()=>{}} systemStatusLabel="Offline" systemConnected={false}/>;}
it('groups specialist tools instead of presenting competing primary panels',()=>{
 render(<MemoryRouter><Subject/></MemoryRouter>);
 const group=screen.getByText('Tools').closest('details')!;
 expect(within(group).getByText('Marketing')).toBeInTheDocument();
 expect(group).not.toHaveAttribute('open');
});
