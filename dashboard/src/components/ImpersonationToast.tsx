export default function ImpersonationToast({ groupName }: { groupName: string }) {
  return (
    <div className="impersonation-toast" role="status" aria-live="polite">
      <div>
        <strong>Режим перегляду</strong>
        <span>Зараз сайт показується як група: {groupName}</span>
      </div>
      <form action="/api/admin/impersonation/end" method="post">
        <button type="submit">Завершити перегляд</button>
      </form>
    </div>
  );
}
