import { useState } from 'react';
import { TicketList } from '../tickets/TicketList';
import { TicketDetails } from '../tickets/TicketDetails';
import { CreateTicketForm } from '../tickets/CreateTicketForm';
import { Ticket } from '../tickets/types';

// TODO: Replace with real user ID from context
const CURRENT_USER_ID = 'demo-user';

export default function TicketsPage() {
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [refresh, setRefresh] = useState(0);

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h2>Support Tickets</h2>
      {!selected ? (
        <>
          <CreateTicketForm currentUserId={CURRENT_USER_ID} onCreated={() => setRefresh(r => r + 1)} />
          <TicketList key={refresh} onSelect={setSelected} />
        </>
      ) : (
        <TicketDetails ticketId={selected._id} currentUserId={CURRENT_USER_ID} onBack={() => setSelected(null)} />
      )}
    </div>
  );
}
