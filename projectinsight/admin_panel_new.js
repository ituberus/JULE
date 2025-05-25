// admin_panel_new.js

document.addEventListener('DOMContentLoaded', () => {
  const usersTableBody = document.querySelector('#users-table tbody');
  const userDetailsDiv = document.getElementById('user-details');
  const userInfoDiv = document.getElementById('user-info');
  const closeUserDetailsBtn = document.getElementById('close-user-details');

  const pendingDepositsTableBody = document.querySelector('#pending-deposits-table tbody');
  const pendingWithdrawalsTableBody = document.querySelector('#pending-withdrawals-table tbody');
  
  const subscriptionPlansTableBody = document.querySelector('#subscription-plans-table tbody');
  const createNewPlanBtn = document.getElementById('create-new-plan-btn');

  const signalPlansTableBody = document.querySelector('#signal-plans-table tbody');
  const createNewSignalPlanBtn = document.getElementById('create-new-signal-plan-btn');

  const stakeableCoinsTableBody = document.querySelector('#stakeable-coins-table tbody');
  const addNewStakeableCoinBtn = document.getElementById('add-new-stakeable-coin-btn');

  // Copy Traders Elements
  const copyTradersTableBody = document.querySelector('#copy-traders-table tbody');
  const addNewCopyTraderBtn = document.getElementById('add-new-copy-trader-btn');


  const editModal = document.getElementById('edit-modal');
  const editModalTitle = document.getElementById('edit-modal-title'); 
  const closeEditModalBtn = document.getElementById('close-edit-modal');
  const editForm = document.getElementById('edit-form');
  const editFormFields = document.getElementById('edit-form-fields');
  const editFormSubmitButton = document.getElementById('edit-form-submit-button');

  let allUsersData = []; 
  let currentEdit = { 
    type: '', 
    id: null,
    userId: null, 
    data: null, 
    fieldToEdit: null 
  };

  // --- Utility Functions ---
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  // --- User Management ---
  async function fetchUsers() { 
    try {
      const res = await fetch('/api/users', { method: 'GET', credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
      const users = await res.json();
      allUsersData = users; 
      populateUsersTable(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      if (usersTableBody) usersTableBody.innerHTML = `<tr><td colspan="8">Error loading users: ${error.message}</td></tr>`;
    }
  }
  function populateUsersTable(users) { 
    if (!usersTableBody) return;
    usersTableBody.innerHTML = '';
    users.forEach(user => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${user.id}</td><td>${user.firstName || 'N/A'}</td><td>${user.lastName || 'N/A'}</td>
        <td>${user.email}</td><td>${user.country || 'N/A'}</td><td>${user.accountCurrency || 'N/A'}</td>
        <td>${user.verificationStatus || 'N/A'}</td>
        <td>
          <button class="button view" data-user-id="${user.id}">View</button>
          <button class="button edit-user" data-user-id="${user.id}">Edit User</button>
        </td>
      `;
      usersTableBody.appendChild(tr);
    });
    document.querySelectorAll('.button.view').forEach(button => button.addEventListener('click', () => viewUserDetails(button.dataset.userId)));
    document.querySelectorAll('.button.edit-user').forEach(button => button.addEventListener('click', () => editUserMainEntry(button.dataset.userId)));
  }
  
  // --- Deposit Review ---
  async function fetchPendingDeposits() {  
    if (!pendingDepositsTableBody) { return; }
    try {
        const res = await fetch('/api/admin/deposits_for_review', { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to fetch pending deposits: ${res.status}`);
        const deposits = await res.json();
        populatePendingDepositsTable(deposits);
    } catch (error) {
        console.error('Error fetching pending deposits:', error);
        pendingDepositsTableBody.innerHTML = `<tr><td colspan="8">Error loading deposits: ${error.message}</td></tr>`;
    }
  }
  function populatePendingDepositsTable(deposits) {  
    pendingDepositsTableBody.innerHTML = '';
    if (deposits.length === 0) {
        pendingDepositsTableBody.innerHTML = '<tr><td colspan="8">No deposits pending review.</td></tr>';
        return;
    }
    deposits.forEach(deposit => {
        const userEmail = allUsersData.find(u => u.id === deposit.userId)?.email || 'N/A';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${deposit.id}</td><td>${deposit.userId} (${userEmail})</td><td>${formatDate(deposit.date)}</td>
            <td>${deposit.reference}</td><td>${deposit.method}</td><td>${deposit.amount}</td>
            <td>${deposit.admin_status}</td>
            <td><button class="button review deposit-review-btn" data-deposit-id="${deposit.id}">Review</button></td>
        `;
        tr.querySelector('.deposit-review-btn').dataset.deposit = JSON.stringify(deposit);
        pendingDepositsTableBody.appendChild(tr);
    });
    document.querySelectorAll('.deposit-review-btn').forEach(button => {
        button.addEventListener('click', (e) => openDepositReviewModal(JSON.parse(e.target.dataset.deposit)));
    });
  }
  function openDepositReviewModal(deposit) {  
    currentEdit = { type: 'deposit_review', id: deposit.id, data: deposit, userId: deposit.userId };
    editModalTitle.textContent = `Review Deposit ID: ${deposit.id}`;
    editFormFields.innerHTML = `
        <div class="form-group"><label>User ID:</label><div class="readonly-field">${deposit.userId} (Email: ${allUsersData.find(u => u.id === deposit.userId)?.email || 'N/A'})</div></div>
        <div class="form-group"><label>Date:</label><div class="readonly-field">${formatDate(deposit.date)}</div></div>
        <div class="form-group"><label>Reference:</label><div class="readonly-field">${deposit.reference}</div></div>
        <div class="form-group"><label>Method (Coin):</label><div class="readonly-field">${deposit.method}</div></div>
        <div class="form-group"><label>User Submitted Amount:</label><div class="readonly-field">${deposit.amount}</div></div>
        <div class="form-group"><label for="admin_approved_amount">Approved Amount:</label><input type="number" id="admin_approved_amount" name="admin_approved_amount" value="${deposit.admin_approved_amount || deposit.amount}" step="any" required></div>
        <div class="form-group"><label for="admin_status">Status:</label><select id="admin_status" name="admin_status"><option value="approved">Approve</option><option value="rejected">Reject</option></select></div>
        <div class="form-group"><label for="admin_remarks">Admin Remarks:</label><textarea id="admin_remarks" name="admin_remarks">${deposit.admin_remarks || ''}</textarea></div>
    `;
    editFormSubmitButton.textContent = 'Submit Deposit Review';
    editModal.style.display = 'block';
  }
  async function submitDepositReview() {  
    const { id: depositId, data: depositData } = currentEdit; 
    const admin_status = document.getElementById('admin_status').value;
    const admin_approved_amount = document.getElementById('admin_approved_amount').value;
    const admin_remarks = document.getElementById('admin_remarks').value;

    if (!admin_status) { alert("Please select a status."); return; }
    if (admin_status === 'approved' && (admin_approved_amount === '' || parseFloat(admin_approved_amount) < 0)) {
        alert("Please enter a valid approved amount."); return;
    }
    const payload = { admin_status, admin_approved_amount: admin_status === 'approved' ? admin_approved_amount : depositData.amount, admin_remarks };
    try {
        const res = await fetch(`/api/admin/deposits/${depositId}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to submit review.');
        alert(result.message || "Review submitted.");
        closeEditModal(); fetchPendingDeposits();
    } catch (error) { console.error("Error submitting deposit review:", error); alert(`Error: ${error.message}`); }
  }

  // --- WITHDRAWAL REVIEW FUNCTIONS ---
  async function fetchPendingWithdrawals() {  
    if (!pendingWithdrawalsTableBody) { return; }
    try {
        const res = await fetch('/api/admin/withdrawals_for_review', { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to fetch pending withdrawals: ${res.status}`);
        const withdrawals = await res.json();
        populatePendingWithdrawalsTable(withdrawals);
    } catch (error) {
        console.error('Error fetching pending withdrawals:', error);
        pendingWithdrawalsTableBody.innerHTML = `<tr><td colspan="8">Error loading withdrawals: ${error.message}</td></tr>`;
    }
  }
  function populatePendingWithdrawalsTable(withdrawals) {  
    pendingWithdrawalsTableBody.innerHTML = '';
    if (withdrawals.length === 0) {
        pendingWithdrawalsTableBody.innerHTML = '<tr><td colspan="8">No withdrawals pending review.</td></tr>';
        return;
    }
    withdrawals.forEach(withdrawal => {
        const userEmail = allUsersData.find(u => u.id === withdrawal.userId)?.email || 'N/A';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${withdrawal.id}</td><td>${withdrawal.userId} (${userEmail})</td><td>${formatDate(withdrawal.date)}</td>
            <td>${withdrawal.reference}</td><td>${withdrawal.method}</td><td>${withdrawal.amount}</td>
            <td>${withdrawal.admin_status}</td>
            <td><button class="button review withdrawal-review-btn" data-withdrawal-id="${withdrawal.id}">Review</button></td>
        `;
        tr.querySelector('.withdrawal-review-btn').dataset.withdrawal = JSON.stringify(withdrawal);
        pendingWithdrawalsTableBody.appendChild(tr);
    });
    document.querySelectorAll('.withdrawal-review-btn').forEach(button => {
        button.addEventListener('click', (e) => openWithdrawalReviewModal(JSON.parse(e.target.dataset.withdrawal)));
    });
  }
  function openWithdrawalReviewModal(withdrawal) { 
    currentEdit = { type: 'withdrawal_review', id: withdrawal.id, data: withdrawal, userId: withdrawal.userId };
    editModalTitle.textContent = `Review Withdrawal ID: ${withdrawal.id}`;
    editFormFields.innerHTML = `
        <div class="form-group"><label>User ID:</label><div class="readonly-field">${withdrawal.userId} (Email: ${allUsersData.find(u => u.id === withdrawal.userId)?.email || 'N/A'})</div></div>
        <div class="form-group"><label>Date:</label><div class="readonly-field">${formatDate(withdrawal.date)}</div></div>
        <div class="form-group"><label>Method (Coin):</label><div class="readonly-field">${withdrawal.method}</div></div>
        <div class="form-group"><label>User Requested Amount:</label><div class="readonly-field">${withdrawal.amount}</div></div>
        <div class="form-group"><label for="admin_processed_amount">Processed Amount:</label><input type="number" id="admin_processed_amount" name="admin_processed_amount" value="${withdrawal.admin_processed_amount || withdrawal.amount}" step="any" required></div>
        <div class="form-group"><label for="withdrawal_fee">Withdrawal Fee:</label><input type="number" id="withdrawal_fee" name="withdrawal_fee" value="${withdrawal.withdrawal_fee || '0'}" step="any" required></div>
        <div class="form-group"><label for="admin_status">Status:</label><select id="admin_status" name="admin_status"><option value="approved">Approve</option><option value="rejected">Reject</option></select></div>
        <div class="form-group"><label for="admin_remarks">Admin Remarks:</label><textarea id="admin_remarks" name="admin_remarks">${withdrawal.admin_remarks || ''}</textarea></div>
    `;
    editFormSubmitButton.textContent = 'Submit Withdrawal Review';
    editModal.style.display = 'block';
  }
  async function submitWithdrawalReview() {  
    const { id: withdrawalId, data: withdrawalData } = currentEdit; // Use data from currentEdit
    const admin_status = document.getElementById('admin_status').value;
    const admin_processed_amount = document.getElementById('admin_processed_amount').value;
    const withdrawal_fee = document.getElementById('withdrawal_fee').value;
    const admin_remarks = document.getElementById('admin_remarks').value;

    if (!admin_status) { alert("Please select a status."); return; }
    if (admin_status === 'approved') {
        if (admin_processed_amount === '' || parseFloat(admin_processed_amount) < 0) { alert("Valid processed amount required."); return; }
        if (withdrawal_fee === '' || parseFloat(withdrawal_fee) < 0) { alert("Valid withdrawal fee required."); return; }
    }
    const payload = { admin_status, admin_processed_amount: admin_status === 'approved' ? admin_processed_amount : withdrawalData.amount, withdrawal_fee: admin_status === 'approved' ? withdrawal_fee : '0', admin_remarks };
    try {
        const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to submit review.');
        alert(result.message || "Review submitted.");
        closeEditModal(); fetchPendingWithdrawals();
    } catch (error) { console.error("Error submitting withdrawal review:", error); alert(`Error: ${error.message}`); }
  }

  // --- SUBSCRIPTION PLAN FUNCTIONS ---
  async function fetchSubscriptionPlans() {  
    if (!subscriptionPlansTableBody) return;
    try {
        const res = await fetch('/api/admin/subscription_plans', { credentials: 'include' });
        if(!res.ok) throw new Error(`Failed to fetch plans: ${res.status}`);
        const plans = await res.json();
        populateSubscriptionPlansTable(plans);
    } catch (error) {
        console.error("Error fetching subscription plans:", error);
        subscriptionPlansTableBody.innerHTML = `<tr><td colspan="7">Error loading plans: ${error.message}</td></tr>`;
    }
  }
  function populateSubscriptionPlansTable(plans) {  
    subscriptionPlansTableBody.innerHTML = '';
    if (plans.length === 0) {
        subscriptionPlansTableBody.innerHTML = '<tr><td colspan="7">No subscription plans found.</td></tr>';
        return;
    }
    plans.forEach(plan => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${plan.id}</td><td>${plan.name}</td><td>${plan.price}</td><td>${plan.currency}</td>
            <td>${plan.duration_days}</td><td>${plan.is_active ? 'Yes' : 'No'}</td>
            <td>
                <button class="button edit edit-plan-btn" data-plan-id="${plan.id}">Edit</button>
                <button class="button toggle-active plan-toggle-btn" data-plan-id="${plan.id}" data-is-active="${plan.is_active}">
                    ${plan.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        `;
        tr.querySelector('.edit-plan-btn').dataset.plan = JSON.stringify(plan);
        subscriptionPlansTableBody.appendChild(tr); 
    });
    document.querySelectorAll('.edit-plan-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openSubscriptionPlanModal(JSON.parse(e.target.dataset.plan)));
    });
    document.querySelectorAll('.plan-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => togglePlanActiveState(e.target.dataset.planId, e.target.dataset.isActive));
    });
  }
  function openSubscriptionPlanModal(plan = null) {  
    currentEdit = { type: 'subscription_plan', id: plan ? plan.id : null, data: plan };
    editModalTitle.textContent = plan ? `Edit Subscription Plan ID: ${plan.id}` : 'Create New Subscription Plan';
    editFormFields.innerHTML = `
        <div class="form-group"><label for="plan_name">Name:</label><input type="text" id="plan_name" name="name" value="${plan ? plan.name : ''}" required></div>
        <div class="form-group"><label for="plan_description">Description:</label><textarea id="plan_description" name="description">${plan ? plan.description || '' : ''}</textarea></div>
        <div class="form-group"><label for="plan_icon_url">Icon URL:</label><input type="text" id="plan_icon_url" name="icon_url" value="${plan ? plan.icon_url || '' : ''}"></div>
        <div class="form-group"><label for="plan_price">Price:</label><input type="number" id="plan_price" name="price" value="${plan ? plan.price : ''}" step="0.01" required></div>
        <div class="form-group"><label for="plan_currency">Currency:</label><input type="text" id="plan_currency" name="currency" value="${plan ? plan.currency : 'USD'}" required></div>
        <div class="form-group"><label for="plan_duration_days">Duration (Days):</label><input type="number" id="plan_duration_days" name="duration_days" value="${plan ? plan.duration_days : '30'}" step="1" required></div>
        <div class="form-group"><label for="plan_is_active">Is Active:</label><input type="checkbox" id="plan_is_active" name="is_active" ${plan ? (plan.is_active ? 'checked' : '') : 'checked'}></div>
    `;
    editFormSubmitButton.textContent = plan ? 'Update Plan' : 'Create Plan';
    editModal.style.display = 'block';
  }
  async function submitSubscriptionPlan() {  
    const { id: planId } = currentEdit;
    const name = document.getElementById('plan_name').value;
    const description = document.getElementById('plan_description').value;
    const icon_url = document.getElementById('plan_icon_url').value;
    const price = document.getElementById('plan_price').value;
    const currency = document.getElementById('plan_currency').value;
    const duration_days = document.getElementById('plan_duration_days').value;
    const is_active = document.getElementById('plan_is_active').checked;

    if (!name || price === '' || !currency || duration_days === '') { alert("Name, Price, Currency, and Duration are required."); return; }
    const payload = { name, description, icon_url, price, currency, duration_days, is_active };
    const url = planId ? `/api/admin/subscription_plans/${planId}` : '/api/admin/subscription_plans';
    const method = planId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `Failed to ${planId ? 'update' : 'create'} plan.`);
        alert(result.message || `Plan ${planId ? 'updated' : 'created'} successfully.`);
        closeEditModal(); fetchSubscriptionPlans();
    } catch (error) { console.error(`Error ${planId ? 'updating' : 'creating'} plan:`, error); alert(`Error: ${error.message}`);}
  }
  async function togglePlanActiveState(planId, currentIsActive) {  
    const newIsActive = !(parseInt(currentIsActive)); 
    if (!confirm(`Are you sure you want to ${newIsActive ? 'activate' : 'deactivate'} Plan ID ${planId}?`)) return;
    const payload = { is_active: newIsActive };
    try {
        const res = await fetch(`/api/admin/subscription_plans/${planId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to toggle plan status.');
        alert(result.message || 'Plan status updated.');
        fetchSubscriptionPlans();
    } catch (error) { console.error('Error toggling plan status:', error); alert(`Error: ${error.message}`);}
  }
  if(createNewPlanBtn) createNewPlanBtn.addEventListener('click', () => openSubscriptionPlanModal());

  // --- SIGNAL PLAN FUNCTIONS ---
  async function fetchSignalPlans() { 
    if (!signalPlansTableBody) return;
    try {
        const res = await fetch('/api/admin/signal_plans', { credentials: 'include' });
        if(!res.ok) throw new Error(`Failed to fetch signal plans: ${res.status}`);
        const plans = await res.json();
        populateSignalPlansTable(plans);
    } catch (error) {
        console.error("Error fetching signal plans:", error);
        signalPlansTableBody.innerHTML = `<tr><td colspan="8">Error loading signal plans: ${error.message}</td></tr>`;
    }
  }
  function populateSignalPlansTable(plans) { 
    signalPlansTableBody.innerHTML = '';
    if (plans.length === 0) {
        signalPlansTableBody.innerHTML = '<tr><td colspan="8">No signal plans found.</td></tr>';
        return;
    }
    plans.forEach(plan => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${plan.id}</td><td>${plan.name}</td><td>${plan.min_deposit}</td><td>${plan.max_deposit === 0 ? 'No Limit' : plan.max_deposit}</td>
            <td>${plan.currency}</td><td>${plan.performance_metric || 'N/A'}</td><td>${plan.is_active ? 'Yes' : 'No'}</td>
            <td>
                <button class="button edit edit-signal-plan-btn" data-plan-id="${plan.id}">Edit</button>
                <button class="button toggle-active signal-plan-toggle-btn" data-plan-id="${plan.id}" data-is-active="${plan.is_active}">
                    ${plan.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        `;
        tr.querySelector('.edit-signal-plan-btn').dataset.plan = JSON.stringify(plan);
        signalPlansTableBody.appendChild(tr); 
    });
    document.querySelectorAll('.edit-signal-plan-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openSignalPlanModal(JSON.parse(e.target.dataset.plan)));
    });
    document.querySelectorAll('.signal-plan-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => toggleSignalPlanActiveState(e.target.dataset.planId, e.target.dataset.isActive));
    });
  }
  function openSignalPlanModal(plan = null) { 
    currentEdit = { type: 'signal_plan', id: plan ? plan.id : null, data: plan };
    editModalTitle.textContent = plan ? `Edit Signal Plan ID: ${plan.id}` : 'Create New Signal Plan';
    editFormFields.innerHTML = `
        <div class="form-group"><label for="signal_plan_name">Name:</label><input type="text" id="signal_plan_name" name="name" value="${plan ? plan.name : ''}" required></div>
        <div class="form-group"><label for="signal_plan_description">Description:</label><textarea id="signal_plan_description" name="description">${plan ? plan.description || '' : ''}</textarea></div>
        <div class="form-group"><label for="signal_plan_min_deposit">Min Deposit:</label><input type="number" id="signal_plan_min_deposit" name="min_deposit" value="${plan ? plan.min_deposit : '0'}" step="any" required></div>
        <div class="form-group"><label for="signal_plan_max_deposit">Max Deposit (0 for no limit):</label><input type="number" id="signal_plan_max_deposit" name="max_deposit" value="${plan ? plan.max_deposit : '0'}" step="any" required></div>
        <div class="form-group"><label for="signal_plan_currency">Currency (for Deposits):</label><input type="text" id="signal_plan_currency" name="currency" value="${plan ? plan.currency : 'USD'}" required></div>
        <div class="form-group"><label for="signal_plan_performance_metric">Performance Metric:</label><input type="text" id="signal_plan_performance_metric" name="performance_metric" value="${plan ? plan.performance_metric || '' : ''}" placeholder="e.g., ROI: 15%/month"></div>
        <div class="form-group"><label for="signal_plan_is_active">Is Active:</label><input type="checkbox" id="signal_plan_is_active" name="is_active" ${plan ? (plan.is_active ? 'checked' : '') : 'checked'}></div>
    `;
    editFormSubmitButton.textContent = plan ? 'Update Signal Plan' : 'Create Signal Plan';
    editModal.style.display = 'block';
  }
  async function submitSignalPlan() { 
    const { id: planId } = currentEdit;
    const name = document.getElementById('signal_plan_name').value;
    const description = document.getElementById('signal_plan_description').value;
    const min_deposit = document.getElementById('signal_plan_min_deposit').value;
    const max_deposit = document.getElementById('signal_plan_max_deposit').value;
    const currency = document.getElementById('signal_plan_currency').value;
    const performance_metric = document.getElementById('signal_plan_performance_metric').value;
    const is_active = document.getElementById('signal_plan_is_active').checked;

    if (!name || currency === '' || performance_metric === '' || min_deposit === '' || max_deposit === '') { alert("Name, Currency, Performance Metric, Min Deposit, and Max Deposit are required."); return; }
    const payload = { name, description, min_deposit, max_deposit, currency, performance_metric, is_active };
    const url = planId ? `/api/admin/signal_plans/${planId}` : '/api/admin/signal_plans';
    const method = planId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `Failed to ${planId ? 'update' : 'create'} signal plan.`);
        alert(result.message || `Signal plan ${planId ? 'updated' : 'created'} successfully.`);
        closeEditModal(); fetchSignalPlans();
    } catch (error) { console.error(`Error ${planId ? 'updating' : 'creating'} signal plan:`, error); alert(`Error: ${error.message}`);}
  }
  async function toggleSignalPlanActiveState(planId, currentIsActive) { 
    const newIsActive = !(parseInt(currentIsActive)); 
    if (!confirm(`Are you sure you want to ${newIsActive ? 'activate' : 'deactivate'} Signal Plan ID ${planId}?`)) return;
    const payload = { is_active: newIsActive }; 
    try {
        const res = await fetch(`/api/admin/signal_plans/${planId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to toggle signal plan status.');
        alert(result.message || 'Signal plan status updated.');
        fetchSignalPlans();
    } catch (error) { console.error('Error toggling signal plan status:', error); alert(`Error: ${error.message}`);}
  }
  if(createNewSignalPlanBtn) createNewSignalPlanBtn.addEventListener('click', () => openSignalPlanModal());

  // --- STAKEABLE COIN FUNCTIONS ---
  async function fetchStakeableCoins() { 
    if (!stakeableCoinsTableBody) return;
    try {
        const res = await fetch('/api/admin/stakeable_coins', { credentials: 'include' });
        if(!res.ok) throw new Error(`Failed to fetch stakeable coins: ${res.status}`);
        const coins = await res.json();
        populateStakeableCoinsTable(coins);
    } catch (error) {
        console.error("Error fetching stakeable coins:", error);
        stakeableCoinsTableBody.innerHTML = `<tr><td colspan="9">Error loading stakeable coins: ${error.message}</td></tr>`;
    }
  }
  function populateStakeableCoinsTable(coins) { 
    stakeableCoinsTableBody.innerHTML = '';
    if (coins.length === 0) {
        stakeableCoinsTableBody.innerHTML = '<tr><td colspan="9">No stakeable coins found. Add some!</td></tr>';
        return;
    }
    coins.forEach(coin => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${coin.id}</td><td>${coin.name}</td><td>${coin.short_name}</td><td>${coin.roi_percentage}%</td>
            <td>${coin.roi_period}</td><td>${coin.min_stake}</td><td>${coin.lockup_days}</td>
            <td>${coin.is_active ? 'Yes' : 'No'}</td>
            <td>
                <button class="button edit edit-stakeable-coin-btn" data-coin-id="${coin.id}">Edit</button>
                <button class="button toggle-active stakeable-coin-toggle-btn" data-coin-id="${coin.id}" data-is-active="${coin.is_active}">
                    ${coin.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        `;
        tr.querySelector('.edit-stakeable-coin-btn').dataset.coin = JSON.stringify(coin);
        stakeableCoinsTableBody.appendChild(tr); 
    });
    document.querySelectorAll('.edit-stakeable-coin-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openStakeableCoinModal(JSON.parse(e.target.dataset.coin)));
    });
    document.querySelectorAll('.stakeable-coin-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => toggleStakeableCoinActiveState(e.target.dataset.coinId, e.target.dataset.isActive));
    });
  }
  function openStakeableCoinModal(coin = null) { 
    currentEdit = { type: 'stakeable_coin', id: coin ? coin.id : null, data: coin };
    editModalTitle.textContent = coin ? `Edit Stakeable Coin ID: ${coin.id}` : 'Add New Stakeable Coin';
    editFormFields.innerHTML = `
        <div class="form-group"><label for="stake_coin_name">Name:</label><input type="text" id="stake_coin_name" name="name" value="${coin ? coin.name : ''}" required></div>
        <div class="form-group"><label for="stake_coin_short_name">Short Name (e.g., BTC):</label><input type="text" id="stake_coin_short_name" name="short_name" value="${coin ? coin.short_name : ''}" required></div>
        <div class="form-group"><label for="stake_coin_icon_url">Icon URL:</label><input type="text" id="stake_coin_icon_url" name="icon_url" value="${coin ? coin.icon_url || '' : ''}"></div>
        <div class="form-group"><label for="stake_roi_percentage">ROI Percentage (e.g., 5.5 for 5.5%):</label><input type="number" id="stake_roi_percentage" name="roi_percentage" value="${coin ? coin.roi_percentage : ''}" step="0.01" required></div>
        <div class="form-group"><label for="stake_roi_period">ROI Period:</label><select id="stake_roi_period" name="roi_period"><option value="daily" ${coin && coin.roi_period === 'daily' ? 'selected' : ''}>Daily</option><option value="weekly" ${coin && coin.roi_period === 'weekly' ? 'selected' : ''}>Weekly</option><option value="monthly" ${coin && coin.roi_period === 'monthly' ? 'selected' : ''}>Monthly</option><option value="yearly" ${coin && coin.roi_period === 'yearly' ? 'selected' : (!coin ? 'selected' : '')}>Yearly</option></select></div>
        <div class="form-group"><label for="stake_min_stake">Minimum Stake:</label><input type="number" id="stake_min_stake" name="min_stake" value="${coin ? coin.min_stake : '0'}" step="any"></div>
        <div class="form-group"><label for="stake_lockup_days">Lockup Period (Days):</label><input type="number" id="stake_lockup_days" name="lockup_days" value="${coin ? coin.lockup_days : '0'}" step="1"></div>
        <div class="form-group"><label for="stake_is_active">Is Active:</label><input type="checkbox" id="stake_is_active" name="is_active" ${coin ? (coin.is_active ? 'checked' : '') : 'checked'}></div>
    `;
    editFormSubmitButton.textContent = coin ? 'Update Stakeable Coin' : 'Create Stakeable Coin';
    editModal.style.display = 'block';
  }
  async function submitStakeableCoin() { 
    const { id: coinId } = currentEdit;
    const name = document.getElementById('stake_coin_name').value;
    const short_name = document.getElementById('stake_coin_short_name').value;
    const icon_url = document.getElementById('stake_coin_icon_url').value;
    const roi_percentage = document.getElementById('stake_roi_percentage').value;
    const roi_period = document.getElementById('stake_roi_period').value;
    const min_stake = document.getElementById('stake_min_stake').value;
    const lockup_days = document.getElementById('stake_lockup_days').value;
    const is_active = document.getElementById('stake_is_active').checked;

    if (!name || !short_name || roi_percentage === '') { alert("Name, Short Name, and ROI Percentage are required."); return; }
    const payload = { name, short_name, icon_url, roi_percentage, roi_period, min_stake, lockup_days, is_active };
    const url = coinId ? `/api/admin/stakeable_coins/${coinId}` : '/api/admin/stakeable_coins';
    const method = coinId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `Failed to ${coinId ? 'update' : 'create'} stakeable coin.`);
        alert(result.message || `Stakeable coin ${coinId ? 'updated' : 'created'} successfully.`);
        closeEditModal(); fetchStakeableCoins();
    } catch (error) { console.error(`Error ${coinId ? 'updating' : 'creating'} stakeable coin:`, error); alert(`Error: ${error.message}`);}
  }
  async function toggleStakeableCoinActiveState(coinId, currentIsActive) { 
    const newIsActive = !(parseInt(currentIsActive)); 
    if (!confirm(`Are you sure you want to ${newIsActive ? 'activate' : 'deactivate'} Stakeable Coin ID ${coinId}?`)) return;
    const payload = { is_active: newIsActive };
    try {
        const res = await fetch(`/api/admin/stakeable_coins/${coinId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to toggle stakeable coin status.');
        alert(result.message || 'Stakeable coin status updated.');
        fetchStakeableCoins();
    } catch (error) { console.error('Error toggling stakeable coin status:', error); alert(`Error: ${error.message}`);}
  }
  if(addNewStakeableCoinBtn) addNewStakeableCoinBtn.addEventListener('click', () => openStakeableCoinModal());

  // --- COPY TRADER FUNCTIONS (NEW) ---
  async function fetchCopyTraders() {
    if (!copyTradersTableBody) return;
    try {
        const res = await fetch('/api/admin/copy_traders', { credentials: 'include' });
        if(!res.ok) throw new Error(`Failed to fetch copy traders: ${res.status}`);
        const traders = await res.json();
        populateCopyTradersTable(traders);
    } catch (error) {
        console.error("Error fetching copy traders:", error);
        copyTradersTableBody.innerHTML = `<tr><td colspan="5">Error loading copy traders: ${error.message}</td></tr>`;
    }
  }

  function populateCopyTradersTable(traders) {
    copyTradersTableBody.innerHTML = '';
    if (traders.length === 0) {
        copyTradersTableBody.innerHTML = '<tr><td colspan="5">No copy traders found. Add some!</td></tr>';
        return;
    }
    traders.forEach(trader => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${trader.id}</td>
            <td>${trader.name}</td>
            <td>${trader.performance_metric_demo || 'N/A'}</td>
            <td>${trader.is_active ? 'Yes' : 'No'}</td>
            <td>
                <button class="button edit edit-copy-trader-btn" data-trader-id="${trader.id}">Edit</button>
                <button class="button toggle-active copy-trader-toggle-btn" data-trader-id="${trader.id}" data-is-active="${trader.is_active}">
                    ${trader.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        `;
        tr.querySelector('.edit-copy-trader-btn').dataset.trader = JSON.stringify(trader);
        copyTradersTableBody.appendChild(tr); 
    });

    document.querySelectorAll('.edit-copy-trader-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openCopyTraderModal(JSON.parse(e.target.dataset.trader)));
    });
    document.querySelectorAll('.copy-trader-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => toggleCopyTraderActiveState(e.target.dataset.traderId, e.target.dataset.isActive));
    });
  }
  
  function openCopyTraderModal(trader = null) {
    currentEdit = { type: 'copy_trader', id: trader ? trader.id : null, data: trader };
    editModalTitle.textContent = trader ? `Edit Copy Trader ID: ${trader.id}` : 'Add New Copy Trader';
    editFormFields.innerHTML = `
        <div class="form-group">
            <label for="copy_trader_name">Name:</label>
            <input type="text" id="copy_trader_name" name="name" value="${trader ? trader.name : ''}" required>
        </div>
        <div class="form-group">
            <label for="copy_trader_description">Description:</label>
            <textarea id="copy_trader_description" name="description">${trader ? trader.description || '' : ''}</textarea>
        </div>
        <div class="form-group">
            <label for="copy_trader_image_url">Image URL:</label>
            <input type="text" id="copy_trader_image_url" name="image_url" value="${trader ? trader.image_url || '' : ''}">
        </div>
        <div class="form-group">
            <label for="copy_trader_performance">Performance Metric (Demo):</label>
            <input type="text" id="copy_trader_performance" name="performance_metric_demo" value="${trader ? trader.performance_metric_demo || '' : ''}" placeholder="e.g., +25% (Last 30 days)">
        </div>
        <div class="form-group">
            <label for="copy_trader_strategy">Strategy Summary:</label>
            <textarea id="copy_trader_strategy" name="strategy_summary">${trader ? trader.strategy_summary || '' : ''}</textarea>
        </div>
        <div class="form-group">
            <label for="copy_trader_is_active">Is Active:</label>
            <input type="checkbox" id="copy_trader_is_active" name="is_active" ${trader ? (trader.is_active ? 'checked' : '') : 'checked'}>
        </div>
    `;
    editFormSubmitButton.textContent = trader ? 'Update Copy Trader' : 'Create Copy Trader';
    editModal.style.display = 'block';
  }

  async function submitCopyTrader() {
    const { id: traderId } = currentEdit;
    const name = document.getElementById('copy_trader_name').value;
    const description = document.getElementById('copy_trader_description').value;
    const image_url = document.getElementById('copy_trader_image_url').value;
    const performance_metric_demo = document.getElementById('copy_trader_performance').value;
    const strategy_summary = document.getElementById('copy_trader_strategy').value;
    const is_active = document.getElementById('copy_trader_is_active').checked;

    if (!name) {
        alert("Name is required for a copy trader.");
        return;
    }

    const payload = { name, description, image_url, performance_metric_demo, strategy_summary, is_active };
    const url = traderId ? `/api/admin/copy_traders/${traderId}` : '/api/admin/copy_traders';
    const method = traderId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Credentials': 'include' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `Failed to ${traderId ? 'update' : 'create'} copy trader.`);
        alert(result.message || `Copy trader ${traderId ? 'updated' : 'created'} successfully.`);
        closeEditModal();
        fetchCopyTraders();
    } catch (error) {
        console.error(`Error ${traderId ? 'updating' : 'creating'} copy trader:`, error);
        alert(`Error: ${error.message}`);
    }
  }

  async function toggleCopyTraderActiveState(traderId, currentIsActive) {
    const newIsActive = !(parseInt(currentIsActive)); 
    if (!confirm(`Are you sure you want to ${newIsActive ? 'activate' : 'deactivate'} Copy Trader ID ${traderId}?`)) return;

    const payload = { is_active: newIsActive };
    try {
        const res = await fetch(`/api/admin/copy_traders/${traderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Credentials': 'include' },
            body: JSON.stringify(payload) 
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to toggle copy trader status.');
        alert(result.message || 'Copy trader status updated.');
        fetchCopyTraders();
    } catch (error) {
        console.error('Error toggling copy trader status:', error);
        alert(`Error: ${error.message}`);
    }
  }
  
  if(addNewCopyTraderBtn) addNewCopyTraderBtn.addEventListener('click', () => openCopyTraderModal());
  // --- END COPY TRADER FUNCTIONS ---


  // Existing User Details and Edit Functions (adapted for currentEdit structure)
  function editUserMainEntry(userId) { 
      const user = allUsersData.find(u => u.id.toString() === userId.toString());
      if(!user) { alert('User not found'); return; }
      currentEdit = { type: 'user_main_entry', id: userId, data: user, userId: userId };
      editModalTitle.textContent = `Edit User Details (ID: ${userId})`;
      editFormFields.innerHTML = Object.keys(user).map(key => {
          if (key === 'id' || key === 'createdAt' || key === 'updatedAt') { 
              return `<div class="form-group"><label>${key}:</label><div class="readonly-field">${user[key]}</div></div>`;
          }
          // Add dropdown for copied_trader_id if allCopyTraders data is available
          if (key === 'copied_trader_id' && window.allCopyTradersData) {
              let optionsHtml = '<option value="">None</option>';
              window.allCopyTradersData.forEach(trader => {
                  optionsHtml += `<option value="${trader.id}" ${user[key] == trader.id ? 'selected' : ''}>${trader.name}</option>`;
              });
              return `<div class="form-group"><label for="useredit-${key}">${key}:</label><select id="useredit-${key}" name="${key}">${optionsHtml}</select></div>`;
          }
          return `<div class="form-group"><label for="useredit-${key}">${key}:</label><input type="text" id="useredit-${key}" name="${key}" value="${user[key] || ''}"></div>`;
      }).join('');
      editFormSubmitButton.textContent = 'Save User Changes';
      editModal.style.display = 'block';
  }
  
  function editSubTableEntry(table, id, field, userIdForContext) { 
    currentEdit = { type: 'subtable_field', table, id, fieldToEdit: field, userId: userIdForContext };
    openGenericEditModal(table, id, field); 
  }
  
  async function openGenericEditModal(table, id, field) { 
    try {
      const res = await fetch(`/api/admin/get/${table}/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch entry for ${table}/${id}: ${res.status}`);
      const entry = await res.json();
      currentEdit.data = entry; 

      editModalTitle.textContent = `Edit ${table} (ID: ${id}) - Field: ${field}`;
      editFormFields.innerHTML = `
        <div class="form-group">
            <label for="edit-field-value">${field}:</label>
            <input type="text" id="edit-field-value" name="fieldValue" value="${entry[field] || ''}">
        </div>
      `;
      editFormSubmitButton.textContent = 'Save Change';
      editModal.style.display = 'block';
    } catch (error) { console.error('Error opening generic edit modal:', error); alert(`Error: ${error.message}`);}
  }
  
  function closeEditModal() { 
    editModal.style.display = 'none';
    editForm.reset();
    editFormFields.innerHTML = '';
    currentEdit = { type: '', id: null, userId: null, data: null, fieldToEdit: null };
  }
  closeEditModalBtn.addEventListener('click', closeEditModal);

  editForm.addEventListener('submit', async (e) => { 
    e.preventDefault();
    const { type, table, id, fieldToEdit, userId: contextUserId } = currentEdit;

    if (type === 'deposit_review') await submitDepositReview();
    else if (type === 'withdrawal_review') await submitWithdrawalReview();
    else if (type === 'subscription_plan') await submitSubscriptionPlan();
    else if (type === 'signal_plan') await submitSignalPlan();
    else if (type === 'stakeable_coin') await submitStakeableCoin(); 
    else if (type === 'copy_trader') await submitCopyTrader(); // Added this case
    else if (type === 'user_main_entry') { 
        const payload = {};
        const formElements = editFormFields.querySelectorAll('input, select, textarea'); // Capture all types
        formElements.forEach(el => { if(el.name) payload[el.name] = el.type === 'checkbox' ? el.checked : el.value; });

        try {
            const res = await fetch(`/api/user/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to update user.');
            alert(result.message || 'User updated.');
            closeEditModal(); fetchUsers();
            if (userDetailsDiv.style.display === 'block') viewUserDetails(id);
        } catch (error) { console.error('Error updating user:', error); alert(`Error: ${error.message}`); }

    } else if (type === 'subtable_field') { 
        const fieldValue = editFormFields.querySelector('input[name="fieldValue"]').value;
        const payload = { [fieldToEdit]: fieldValue };
        try {
            const res = await fetch(`/api/admin/update/${table}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `Failed to update ${table}.`);
            alert(result.message || `${table} updated.`);
            closeEditModal();
            if (userDetailsDiv.style.display === 'block' && contextUserId) viewUserDetails(contextUserId);
        } catch (error) { console.error(`Error updating ${table}:`, error); alert(`Error: ${error.message}`);}
    } else if (type === 'add_entry') {
        await submitAddEntry();
    }
  });

  function addEntry(table, forUserId) { 
    currentEdit = { type: 'add_entry', table: table, id: null, userId: forUserId };
    editModalTitle.textContent = `Add New Entry to ${table}`;
    let fields = [];
    if (table === 'user_wallets') fields = ['coinName', 'shortName', 'walletAddress', 'balance'];
    else if (table === 'user_external_wallets') fields = ['walletName', 'walletText'];
    else if (table === 'deposits') fields = ['date', 'reference', 'method', 'type', 'amount', 'totalEUR', 'status', 'admin_status', 'admin_approved_amount', 'admin_remarks'];
    else if (table === 'withdrawals') fields = ['date', 'reference', 'method', 'amount', 'total', 'status', 'admin_status', 'admin_processed_amount', 'withdrawal_fee', 'admin_remarks'];
    // Note: subscription_plans, signal_plans, stakeable_coins, copy_traders have dedicated create buttons.

    editFormFields.innerHTML = fields.map(field => `
        <div class="form-group"><label for="add-${field}">${field}:</label><input type="text" id="add-${field}" name="${field}" value=""></div>
    `).join('');
    if (forUserId && table !=='users' && table !=='subscription_plans' && table !=='signal_plans' && table !== 'stakeable_coins' && table !== 'copy_traders' && !fields.includes('userId')) {
      editFormFields.innerHTML += `<input type="hidden" name="userId" value="${forUserId}">`;
    }
    editFormSubmitButton.textContent = 'Create Entry';
    editModal.style.display = 'block';
  }
  async function submitAddEntry() { 
    const { table, userId: forUserId } = currentEdit;
    const payload = {}; 
    if (forUserId && table !== 'users' && table !== 'subscription_plans' && table !== 'signal_plans' && table !== 'stakeable_coins' && table !== 'copy_traders') { payload.userId = forUserId; }

    const inputs = editFormFields.querySelectorAll('input[type="text"], input[type="number"], input[type="hidden"], select, textarea');
    inputs.forEach(input => { if(input.name) payload[input.name] = input.value; });
    
    if (forUserId && table !== 'users' && table !== 'subscription_plans' && table !== 'signal_plans' && table !== 'stakeable_coins' && table !== 'copy_traders' && !payload.userId) {
        payload.userId = forUserId;
    }

    try {
        const res = await fetch(`/api/admin/insert/${table}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Credentials': 'include' }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `Failed to add to ${table}.`);
        alert(result.message || `${table} entry added successfully.`);
        closeEditModal();
        if (userDetailsDiv.style.display === 'block' && forUserId) viewUserDetails(forUserId); 
        else if (table === 'users') fetchUsers(); 
    } catch (error) { console.error(`Error adding to ${table}:`, error); alert(`Error: ${error.message}`);}
  }


  async function deleteEntry(table, id, userIdForContext) { 
    if (!confirm(`Are you sure you want to delete this entry from ${table} (ID: ${id})? This is a hard delete.`)) return;
    try {
      const res = await fetch(`/api/admin/delete/${table}/${id}`, { method: 'DELETE', credentials: 'include' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Failed to delete entry from ${table}.`);
      alert(result.message || 'Deleted successfully.');
      if (userDetailsDiv.style.display === 'block' && userIdForContext) viewUserDetails(userIdForContext); 
      else if (table === 'users') fetchUsers(); 
      if (table === 'deposits') fetchPendingDeposits();
      if (table === 'withdrawals') fetchPendingWithdrawals();
      if (table === 'subscription_plans') fetchSubscriptionPlans();
      if (table === 'signal_plans') fetchSignalPlans();
      if (table === 'stakeable_coins') fetchStakeableCoins(); 
      // Deleting copy_traders is not handled by this generic function if special logic needed
    } catch (error) { console.error('Error deleting entry:', error); alert(`Error: ${error.message}`);}
  }

  window.onclick = function(event) {
    if (event.target == editModal) {
      closeEditModal();
    }
  }

  // Store all fetched copy traders for user edit dropdown
  window.allCopyTradersData = []; 
  async function fetchAndStoreCopyTraders() {
      try {
          const res = await fetch('/api/admin/copy_traders', {credentials: 'include'});
          if (res.ok) {
              window.allCopyTradersData = await res.json();
          } else {
              console.error("Failed to fetch all copy traders for user edit dropdown");
          }
      } catch (e) {
          console.error("Error fetching all copy traders:", e);
      }
  }


  async function initializeAdminPanel() {
    await fetchUsers(); // Populates allUsersData
    await fetchAndStoreCopyTraders(); // Populates allCopyTradersData
    await fetchPendingDeposits(); 
    await fetchPendingWithdrawals();
    await fetchSubscriptionPlans(); 
    await fetchSignalPlans(); 
    await fetchStakeableCoins(); 
    await fetchCopyTraders(); // New call
  }

  initializeAdminPanel();
});
