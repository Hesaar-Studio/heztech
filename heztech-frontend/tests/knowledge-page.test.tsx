import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {KnowledgePage} from '../src/pages/KnowledgePage';
vi.mock('../src/components/knowledge/KnowledgeGraph3D',()=>({KnowledgeGraph3D:()=>null}));
it('loads actual memory and reveals the selected record',async()=>{
 (window as any).heztech={searchMemory:vi.fn().mockResolvedValue({success:true,knowledge:[{id:'m1',title:'Project evidence',content:'Recorded fact',tags:['Project']}]}),listConversations:vi.fn().mockResolvedValue({success:true,conversations:[]})};
 render(<MemoryRouter><KnowledgePage/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Project evidence'}));
 expect(await screen.findByText('Recorded fact')).toBeInTheDocument();
 delete (window as any).heztech;
});
