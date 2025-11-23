document.getElementById('start-btn')?.addEventListener('click', async () => {
  const authComponent = document.querySelector('auth-component') as any;
  const isLoggedIn = await authComponent.isAuthenticated();

  if (isLoggedIn) {
    window.location.href = '/classes';
  } else {
    authComponent.openAuthModal();
  }
});
