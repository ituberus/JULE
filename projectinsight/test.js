// test.js

document.addEventListener('DOMContentLoaded', () => {
  const usersTableBody = document.querySelector('#users-table tbody');
  const userDetailsDiv = document.getElementById('user-details');
  const userInfoDiv = document.getElementById('user-info');
  const closeUserDetailsBtn = document.getElementById('close-user-details');

  const editModal = document.getElementById('edit-modal');
  const closeEditModalBtn = document.getElementById('close-edit-modal');
  const editForm = document.getElementById('edit-form');
  const editFormFields = document.getElementById('edit-form-fields');

  let currentEdit = {
    table: '',
    id: null,
    userId: null
  };

  // Fetch and display all users
  async function fetchUsers() {
    try {
      const res = await fetch('/api/users', {
        method: 'GET',
        credentials: 'include',
      });
      const users = await res.json();
      populateUsersTable(users);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }

  // Populate the users table
  function populateUsersTable(users) {
    usersTableBody.innerHTML = '';
    users.forEach(user => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${user.id}</td>
        <td>${user.firstName}</td>
        <td>${user.lastName}</td>
        <td>${user.email}</td>
        <td>${user.country}</td>
        <td>${user.accountCurrency}</td>
        <td>${user.verificationStatus}</td>
        <td>
          <button class="button view" data-user-id="${user.id}">View</button>
          <button class="button edit-user" data-user-id="${user.id}">Edit</button>
        </td>
      `;
      usersTableBody.appendChild(tr);
    });

    // Add event listeners for view and edit buttons
    document.querySelectorAll('.button.view').forEach(button => {
      button.addEventListener('click', () => {
        const userId = button.getAttribute('data-user-id');
        viewUserDetails(userId);
      });
    });

    document.querySelectorAll('.button.edit-user').forEach(button => {
      button.addEventListener('click', () => {
        const userId = button.getAttribute('data-user-id');
        editEntry('users', userId, null);
      });
    });
  }

  // View user details
  async function viewUserDetails(userId) {
    try {
      const res = await fetch(`/api/user/${userId}`, {
        method: 'GET',
        credentials: 'include',
      });
      const data = await res.json();
      displayUserDetails(data);
    } catch (error) {
      console.error('Error fetching user details:', error);
    }
  }

  // Display user details
  function displayUserDetails(data) {
    userInfoDiv.innerHTML = '';

    const user = data.user;
    const wallets = data.wallets;
    const externalWallets = data.externalWallets;
    const signals = data.signals;
    const stakes = data.stakes;
    const deposits = data.deposits;
    const withdrawals = data.withdrawals;
    const notifications = data.notifications;

    // User Information
    const userInfoSection = document.createElement('div');
    userInfoSection.innerHTML = `
      <h3>User Information</h3>
      <table>
        <tbody>
          <tr><td>ID</td><td>${user.id}</td></tr>
          <tr><td>First Name</td><td>${user.firstName} <button class="button edit" data-field="firstName">Edit</button></td></tr>
          <tr><td>Last Name</td><td>${user.lastName} <button class="button edit" data-field="lastName">Edit</button></td></tr>
          <tr><td>Email</td><td>${user.email} <button class="button edit" data-field="email">Edit</button></td></tr>
          <tr><td>Phone</td><td>${user.phone} <button class="button edit" data-field="phone">Edit</button></td></tr>
          <tr><td>Country</td><td>${user.country} <button class="button edit" data-field="country">Edit</button></td></tr>
          <tr><td>Account Currency</td><td>${user.accountCurrency} <button class="button edit" data-field="accountCurrency">Edit</button></td></tr>
          <tr><td>Verification Status</td><td>${user.verificationStatus} <button class="button edit" data-field="verificationStatus">Edit</button></td></tr>
          <tr><td>Plan Name</td><td>${user.planName} <button class="button edit" data-field="planName">Edit</button></td></tr>
          <tr><td>Plan Amount</td><td>${user.planAmount} <button class="button edit" data-field="planAmount">Edit</button></td></tr>
          <tr><td>Referrer Used</td><td>${user.referrerUsed} <button class="button edit" data-field="referrerUsed">Edit</button></td></tr>
          <tr><td>My Referrer Code</td><td>${user.myReferrerCode} <button class="button edit" data-field="myReferrerCode">Edit</button></td></tr>
          <tr><td>Referrer Count</td><td>${user.referrerCount} <button class="button edit" data-field="referrerCount">Edit</button></td></tr>
          <tr><td>Referrer Earnings</td><td>${user.referrerEarnings} <button class="button edit" data-field="referrerEarnings">Edit</button></td></tr>
          <tr><td>Created At</td><td>${user.createdAt} <button class="button edit" data-field="createdAt">Edit</button></td></tr>
          <tr><td>Updated At</td><td>${user.updatedAt} <button class="button edit" data-field="updatedAt">Edit</button></td></tr>
        </tbody>
      </table>
    `;
    userInfoDiv.appendChild(userInfoSection);

    // Add event listeners for user info edit buttons
    userInfoSection.querySelectorAll('.button.edit').forEach(button => {
      button.addEventListener('click', () => {
        const field = button.getAttribute('data-field');
        editEntry('users', user.id, field);
      });
    });

    // Wallets
    const walletsSection = document.createElement('div');
    walletsSection.innerHTML = `
      <h3>User Wallets</h3>
      <button class="button add-wallet">Add Wallet</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Coin Name</th>
            <th>Short Name</th>
            <th>Wallet Address</th>
            <th>Private Key</th>
            <th>Balance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${wallets.map(wallet => `
            <tr>
              <td>${wallet.id}</td>
              <td>${wallet.coinName} <button class="button edit" data-table="user_wallets" data-id="${wallet.id}" data-user-id="${user.id}" data-field="coinName">Edit</button></td>
              <td>${wallet.shortName} <button class="button edit" data-table="user_wallets" data-id="${wallet.id}" data-user-id="${user.id}" data-field="shortName">Edit</button></td>
              <td>${wallet.walletAddress} <button class="button edit" data-table="user_wallets" data-id="${wallet.id}" data-user-id="${user.id}" data-field="walletAddress">Edit</button></td>
              <td>${wallet.privateKey} <button class="button edit" data-table="user_wallets" data-id="${wallet.id}" data-user-id="${user.id}" data-field="privateKey">Edit</button></td>
              <td>${wallet.balance} <button class="button edit" data-table="user_wallets" data-id="${wallet.id}" data-user-id="${user.id}" data-field="balance">Edit</button></td>
              <td>
                <button class="button delete-wallet" data-wallet-id="${wallet.id}" data-user-id="${user.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    userInfoDiv.appendChild(walletsSection);

    // Add event listeners for wallets
    walletsSection.querySelectorAll('.button.edit').forEach(button => {
      button.addEventListener('click', () => {
        const table = button.getAttribute('data-table');
        const id = button.getAttribute('data-id');
        const userId = button.getAttribute('data-user-id');
        const field = button.getAttribute('data-field');
        editEntry(table, id, field, userId);
      });
    });

    walletsSection.querySelector('.button.add-wallet').addEventListener('click', () => {
      addEntry('user_wallets', user.id);
    });

    walletsSection.querySelectorAll('.button.delete-wallet').forEach(button => {
      button.addEventListener('click', () => {
        const walletId = button.getAttribute('data-wallet-id');
        deleteEntry('user_wallets', walletId, user.id);
      });
    });

    // External Wallets
    const externalWalletsSection = document.createElement('div');
    externalWalletsSection.innerHTML = `
      <h3>User External Wallets</h3>
      <button class="button add-external-wallet">Add External Wallet</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Wallet Name</th>
            <th>Wallet Text</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${externalWallets.map(ext => `
            <tr>
              <td>${ext.id}</td>
              <td>${ext.walletName} <button class="button edit" data-table="user_external_wallets" data-id="${ext.id}" data-user-id="${user.id}" data-field="walletName">Edit</button></td>
              <td>${ext.walletText} <button class="button edit" data-table="user_external_wallets" data-id="${ext.id}" data-user-id="${user.id}" data-field="walletText">Edit</button></td>
              <td>
                <button class="button delete-external-wallet" data-ext-wallet-id="${ext.id}" data-user-id="${user.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    userInfoDiv.appendChild(externalWalletsSection);

    // Add event listeners for external wallets
    externalWalletsSection.querySelectorAll('.button.edit').forEach(button => {
      button.addEventListener('click', () => {
        const table = button.getAttribute('data-table');
        const id = button.getAttribute('data-id');
        const userId = button.getAttribute('data-user-id');
        const field = button.getAttribute('data-field');
        editEntry(table, id, field, userId);
      });
    });

    externalWalletsSection.querySelector('.button.add-external-wallet').addEventListener('click', () => {
      addEntry('user_external_wallets', user.id);
    });

    externalWalletsSection.querySelectorAll('.button.delete-external-wallet').forEach(button => {
      button.addEventListener('click', () => {
        const extWalletId = button.getAttribute('data-ext-wallet-id');
        deleteEntry('user_external_wallets', extWalletId, user.id);
      });
    });

    // Signals
    const signalsSection = document.createElement('div');
    signalsSection.innerHTML = `
      <h3>User Signals</h3>
      <button class="button add-signal">Add Signal</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Signal Name</th>
            <th>Balance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${signals.map(signal => `
            <tr>
              <td>${signal.id}</td>
              <td>${signal.signalName} <button class="button edit" data-table="user_signals" data-id="${signal.id}" data-user-id="${user.id}" data-field="signalName">Edit</button></td>
              <td>${signal.balance} <button class="button edit" data-table="user_signals" data-id="${signal.id}" data-user-id="${user.id}" data-field="balance">Edit</button></td>
              <td>
                <button class="button delete-signal" data-signal-id="${signal.id}" data-user-id="${user.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    userInfoDiv.appendChild(signalsSection);

    // Add event listeners for signals
    signalsSection.querySelectorAll('.button.edit').forEach(button => {
      button.addEventListener('click', () => {
        const table = button.getAttribute('data-table');
        const id = button.getAttribute('data-id');
        const userId = button.getAttribute('data-user-id');
        const field = button.getAttribute('data-field');
        editEntry(table, id, field, userId);
      });
    });

    signalsSection.querySelector('.button.add-signal').addEventListener('click', () => {
      addEntry('user_signals', user.id);
    });

    signalsSection.querySelectorAll('.button.delete-signal').forEach(button => {
      button.addEventListener('click', () => {
        const signalId = button.getAttribute('data-signal-id');
        deleteEntry('user_signals', signalId, user.id);
      });
    });

    // Stakes
    const stakesSection = document.createElement('div');
    stakesSection.innerHTML = `
      <h3>User Stakes</h3>
      <button class="button add-stake">Add Stake</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Stake Name</th>
            <th>Balance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${stakes.map(stake => `
            <tr>
              <td>${stake.id}</td>
              <td>${stake.stakeName} <button class="button edit" data-table="user_stakes" data-id="${stake.id}" data-user-id="${user.id}" data-field="stakeName">Edit</button></td>
              <td>${stake.balance} <button class="button edit" data-table="user_stakes" data-id="${stake.id}" data-user-id="${user.id}" data-field="balance">Edit</button></td>
              <td>
                <button class="button delete-stake" data-stake-id="${stake.id}" data-user-id="${user.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    userInfoDiv.appendChild(stakesSection);

    // Add event listeners for stakes
    stakesSection.querySelectorAll('.button.edit').forEach(button => {
      button.addEventListener('click', () => {
        const table = button.getAttribute('data-table');
        const id = button.getAttribute('data-id');
        const userId = button.getAttribute('data-user-id');
        const field = button.getAttribute('data-field');
        editEntry(table, id, field, userId);
      });
    });

    stakesSection.querySelector('.button.add-stake').addEventListener('click', () => {
      addEntry('user_stakes', user.id);
    });

    stakesSection.querySelectorAll('.button.delete-stake').forEach(button => {
      button.addEventListener('click', () => {
        const stakeId = button.getAttribute('data-stake-id');
        deleteEntry('user_stakes', stakeId, user.id);
      });
    });

    // Deposits
    const depositsSection = document.createElement('div');
    depositsSection.innerHTML = `
      <h3>User Deposits</h3>
      <button class="button add-deposit">Add Deposit</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Reference</th>
            <th>Method</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Total EUR</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${deposits.map(deposit => `
            <tr>
              <td>${deposit.id}</td>
              <td>${deposit.date} <button class="button edit" data-table="deposits" data-id="${deposit.id}" data-user-id="${user.id}" data-field="date">Edit</button></td>
              <td>${deposit.reference} <button class="button edit" data-table="deposits" data-id="${deposit.id}" data-user-id="${user.id}" data-field="reference">Edit</button></td>
              <td>${deposit.method} <button class="button edit" data-table="deposits" data-id="${deposit.id}" data-user-id="${user.id}" data-field="method">Edit</button></td>
              <td>${deposit.type} <button class="button edit" data-table="deposits" data-id="${deposit.id}" data-user-id="${user.id}" data-field="type">Edit</button></td>
              <td>${deposit.amount} <button class="button edit" data-table="deposits" data-id="${deposit.id}" data-user-id="${user.id}" data-field="amount">Edit</button></td>
              <td>${deposit.totalEUR} <button class="button edit" data-table="deposits" data-id="${deposit.id}" data-user-id="${user.id}" data-field="totalEUR">Edit</button></td>
              <td>${deposit.status} <button class="button edit" data-table="deposits" data-id="${deposit.id}" data-user-id="${user.id}" data-field="status">Edit</button></td>
              <td>
                <button class="button delete-deposit" data-deposit-id="${deposit.id}" data-user-id="${user.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    userInfoDiv.appendChild(depositsSection);

    // Add event listeners for deposits
    depositsSection.querySelectorAll('.button.edit').forEach(button => {
      button.addEventListener('click', () => {
        const table = button.getAttribute('data-table');
        const id = button.getAttribute('data-id');
        const userId = button.getAttribute('data-user-id');
        const field = button.getAttribute('data-field');
        editEntry(table, id, field, userId);
      });
    });

    depositsSection.querySelector('.button.add-deposit').addEventListener('click', () => {
      addEntry('deposits', user.id);
    });

    depositsSection.querySelectorAll('.button.delete-deposit').forEach(button => {
      button.addEventListener('click', () => {
        const depositId = button.getAttribute('data-deposit-id');
        deleteEntry('deposits', depositId, user.id);
      });
    });

    // Withdrawals
    const withdrawalsSection = document.createElement('div');
    withdrawalsSection.innerHTML = `
      <h3>User Withdrawals</h3>
      <button class="button add-withdrawal">Add Withdrawal</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Reference</th>
            <th>Method</th>
            <th>Amount</th>
            <th>Total</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${withdrawals.map(withdrawal => `
            <tr>
              <td>${withdrawal.id}</td>
              <td>${withdrawal.date} <button class="button edit" data-table="withdrawals" data-id="${withdrawal.id}" data-user-id="${user.id}" data-field="date">Edit</button></td>
              <td>${withdrawal.reference} <button class="button edit" data-table="withdrawals" data-id="${withdrawal.id}" data-user-id="${user.id}" data-field="reference">Edit</button></td>
              <td>${withdrawal.method} <button class="button edit" data-table="withdrawals" data-id="${withdrawal.id}" data-user-id="${user.id}" data-field="method">Edit</button></td>
              <td>${withdrawal.amount} <button class="button edit" data-table="withdrawals" data-id="${withdrawal.id}" data-user-id="${user.id}" data-field="amount">Edit</button></td>
              <td>${withdrawal.total} <button class="button edit" data-table="withdrawals" data-id="${withdrawal.id}" data-user-id="${user.id}" data-field="total">Edit</button></td>
              <td>${withdrawal.status} <button class="button edit" data-table="withdrawals" data-id="${withdrawal.id}" data-user-id="${user.id}" data-field="status">Edit</button></td>
              <td>
                <button class="button delete-withdrawal" data-withdrawal-id="${withdrawal.id}" data-user-id="${user.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    userInfoDiv.appendChild(withdrawalsSection);

    // Add event listeners for withdrawals
    withdrawalsSection.querySelectorAll('.button.edit').forEach(button => {
      button.addEventListener('click', () => {
        const table = button.getAttribute('data-table');
        const id = button.getAttribute('data-id');
        const userId = button.getAttribute('data-user-id');
        const field = button.getAttribute('data-field');
        editEntry(table, id, field, userId);
      });
    });

    withdrawalsSection.querySelector('.button.add-withdrawal').addEventListener('click', () => {
      addEntry('withdrawals', user.id);
    });

    withdrawalsSection.querySelectorAll('.button.delete-withdrawal').forEach(button => {
      button.addEventListener('click', () => {
        const withdrawalId = button.getAttribute('data-withdrawal-id');
        deleteEntry('withdrawals', withdrawalId, user.id);
      });
    });

    // Notifications
    const notificationsSection = document.createElement('div');
    notificationsSection.innerHTML = `
      <h3>User Notifications</h3>
      <button class="button add-notification">Add Notification</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Message</th>
            <th>Is Read</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${notifications.map(notification => `
            <tr>
              <td>${notification.id}</td>
              <td>${notification.message} <button class="button edit" data-table="notifications" data-id="${notification.id}" data-user-id="${user.id}" data-field="message">Edit</button></td>
              <td>${notification.isRead ? 'Yes' : 'No'} <button class="button edit" data-table="notifications" data-id="${notification.id}" data-user-id="${user.id}" data-field="isRead">Edit</button></td>
              <td>${notification.createdAt} <button class="button edit" data-table="notifications" data-id="${notification.id}" data-user-id="${user.id}" data-field="createdAt">Edit</button></td>
              <td>
                <button class="button delete-notification" data-notification-id="${notification.id}" data-user-id="${user.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    userInfoDiv.appendChild(notificationsSection);

    // Add event listeners for notifications
    notificationsSection.querySelectorAll('.button.edit').forEach(button => {
      button.addEventListener('click', () => {
        const table = button.getAttribute('data-table');
        const id = button.getAttribute('data-id');
        const userId = button.getAttribute('data-user-id');
        const field = button.getAttribute('data-field');
        editEntry(table, id, field, userId);
      });
    });

    notificationsSection.querySelector('.button.add-notification').addEventListener('click', () => {
      addEntry('notifications', user.id);
    });

    notificationsSection.querySelectorAll('.button.delete-notification').forEach(button => {
      button.addEventListener('click', () => {
        const notificationId = button.getAttribute('data-notification-id');
        deleteEntry('notifications', notificationId, user.id);
      });
    });

    // Show the user details section
    userDetailsDiv.style.display = 'block';
  }

  // Close user details
  closeUserDetailsBtn.addEventListener('click', () => {
    userDetailsDiv.style.display = 'none';
    userInfoDiv.innerHTML = '';
  });

  // Edit Entry Function
  function editEntry(table, id, field, userId = null) {
    currentEdit = { table, id, userId };
    openEditModal(table, id, field);
  }

  // Open Edit Modal
  async function openEditModal(table, id, field) {
    try {
      let entry;
      if (table === 'users') {
        const res = await fetch(`/api/user/${id}`, {
          method: 'GET',
          credentials: 'include',
        });
        const data = await res.json();
        entry = data.user;
      } else {
        const res = await fetch(`/api/admin/get/${table}/${id}`, {
          method: 'GET',
          credentials: 'include',
        });
        entry = await res.json();
      }

      editFormFields.innerHTML = '';

      if (field) {
        // Edit a specific field
        const value = entry[field];
        editFormFields.innerHTML += `
          <div class="form-group">
            <label for="field-value">${field}</label>
            <input type="text" id="field-value" name="fieldValue" value="${value}">
          </div>
        `;
      } else {
        // Edit entire entry
        for (let key in entry) {
          if (key === 'password') continue; // Skip password field
          editFormFields.innerHTML += `
            <div class="form-group">
              <label for="${key}">${key}</label>
              <input type="text" id="${key}" name="${key}" value="${entry[key]}">
            </div>
          `;
        }
      }

      editModal.style.display = 'block';
    } catch (error) {
      console.error('Error opening edit modal:', error);
    }
  }

  // Close Edit Modal
  closeEditModalBtn.addEventListener('click', () => {
    editModal.style.display = 'none';
    editForm.reset();
    editFormFields.innerHTML = '';
    currentEdit = { table: '', id: null, userId: null };
  });

  // Handle Edit Form Submission
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { table, id, userId } = currentEdit;

    let payload = {};
    if (editFormFields.querySelector('input[name="fieldValue"]')) {
      // Editing a single field
      const fieldValue = editFormFields.querySelector('input[name="fieldValue"]').value;
      const fieldName = editFormFields.querySelector('label').innerText;
      // Map label to field name (assuming label matches field)
      const field = fieldName;
      payload[field] = fieldValue;
    } else {
      // Editing entire entry
      const inputs = editFormFields.querySelectorAll('input');
      inputs.forEach(input => {
        payload[input.name] = input.value;
      });
    }

    try {
      let url = '';
      let method = 'PUT';

      if (table === 'users') {
        url = `/api/user/${id}`;
      } else {
        url = `/api/admin/update/${table}/${id}`;
      }

      const res = await fetch(url, {
        method: method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok) {
        alert(`Error: ${result.error || 'Failed to update.'}`);
        return;
      }

      alert(result.message || 'Updated successfully.');
      editModal.style.display = 'none';
      editForm.reset();
      editFormFields.innerHTML = '';
      // Refresh the user details and users list
      if (table === 'users') {
        fetchUsers();
        viewUserDetails(id);
      } else {
        viewUserDetails(userId);
      }
    } catch (error) {
      console.error('Error updating entry:', error);
    }
  });

  // Add Entry Function
  function addEntry(table, userId) {
    currentEdit = { table, id: null, userId };
    openAddModal(table, userId);
  }

  // Open Add Modal
  async function openAddModal(table, userId) {
    try {
      editFormFields.innerHTML = '';

      // Define required fields based on table
      let fields = [];
      switch (table) {
        case 'user_wallets':
          fields = ['coinName', 'shortName', 'walletAddress', 'privateKey', 'balance'];
          break;
        case 'user_external_wallets':
          fields = ['walletName', 'walletText'];
          break;
        case 'user_signals':
          fields = ['signalName', 'balance'];
          break;
        case 'user_stakes':
          fields = ['stakeName', 'balance'];
          break;
        case 'deposits':
          fields = ['date', 'reference', 'method', 'type', 'amount', 'totalEUR'];
          break;
        case 'withdrawals':
          fields = ['date', 'reference', 'method', 'amount', 'total'];
          break;
        case 'notifications':
          fields = ['message', 'isRead', 'createdAt'];
          break;
        default:
          fields = [];
      }

      fields.forEach(field => {
        editFormFields.innerHTML += `
          <div class="form-group">
            <label for="${field}">${field}</label>
            <input type="text" id="${field}" name="${field}" ${field === 'isRead' ? 'value="0"' : ''}>
          </div>
        `;
      });

      editModal.style.display = 'block';
    } catch (error) {
      console.error('Error opening add modal:', error);
    }
  }

  // Handle Add Form Submission
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { table, id, userId } = currentEdit;

    if (id !== null) {
      // Editing existing entry
      return;
    }

    let payload = {};

    const inputs = editFormFields.querySelectorAll('input');
    inputs.forEach(input => {
      payload[input.name] = input.value;
    });

    try {
      let url = '';
      let method = 'POST';

      if (table === 'users') {
        url = `/api/admin/insert/${table}`;
      } else {
        url = `/api/admin/insert/${table}`;
        // For related tables, ensure userId is included
        payload.userId = userId;
      }

      const res = await fetch(url, {
        method: method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok) {
        alert(`Error: ${result.error || 'Failed to add entry.'}`);
        return;
      }

      alert(result.message || 'Added successfully.');
      editModal.style.display = 'none';
      editForm.reset();
      editFormFields.innerHTML = '';
      // Refresh the user details
      viewUserDetails(userId);
    } catch (error) {
      console.error('Error adding entry:', error);
    }
  });

  // Delete Entry Function
  async function deleteEntry(table, id, userId) {
    if (!confirm('Are you sure you want to delete this entry?')) {
      return;
    }

    try {
      let url = '';

      if (table === 'users') {
        url = `/api/admin/delete/${table}/${id}`;
      } else {
        url = `/api/admin/delete/${table}/${id}`;
      }

      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
      });

      const result = await res.json();

      if (!res.ok) {
        alert(`Error: ${result.error || 'Failed to delete entry.'}`);
        return;
      }

      alert(result.message || 'Deleted successfully.');
      // Refresh the user details and users list
      if (table === 'users') {
        fetchUsers();
        userDetailsDiv.style.display = 'none';
        userInfoDiv.innerHTML = '';
      } else {
        viewUserDetails(userId);
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
    }
  }

  // Handle clicks outside the modal to close it
  window.onclick = function(event) {
    if (event.target == editModal) {
      editModal.style.display = "none";
      editForm.reset();
      editFormFields.innerHTML = '';
      currentEdit = { table: '', id: null, userId: null };
    }
  }

  // Initial fetch of users
  fetchUsers();
});
