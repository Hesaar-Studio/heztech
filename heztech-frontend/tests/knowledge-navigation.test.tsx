import {it,expect,vi} from 'vitest';
import {render,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {AssistantPage} from '../src/pages/AssistantPage';
const {getMessages}=vi.hoisted(()=>({getMessages:vi.fn().mockResolvedValue({ok:true,data:[]})}));
vi.mock('../src/hooks/useAdapters',()=>{const adapters={chat:{getMessages,listConversations:async()=>({ok:true,data:[]}),listModels:async()=>({ok:true,data:[]}),getSelectedModel:async()=>({ok:true,data:null})}};return {useAdapters:()=>adapters};});
it('opens the conversation selected in the knowledge map',async()=>{
 render(<MemoryRouter initialEntries={[{pathname:'/assistant',state:{conversationId:'selected-session'}}]}><AssistantPage/></MemoryRouter>);
 await waitFor(()=>expect(getMessages).toHaveBeenCalledWith('selected-session'));
});

