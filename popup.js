document.addEventListener('DOMContentLoaded', function() {
  const fieldSelector = document.getElementById('fieldSelector');
  const datePicker = document.getElementById('datePicker');
  const updateButton = document.getElementById('updateButton');

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  datePicker.value = today;

  updateButton.addEventListener('click', function() {
    const selectedField = fieldSelector.value;
    const selectedDate = datePicker.value;

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateDate",
        field: selectedField,
        date: selectedDate
      });
      
      // Close the popup after sending the message
      window.close();
    });
  });

  function showNotification(message, type) {
    notificationArea.textContent = message;
    notificationArea.style.padding = '10px';
    notificationArea.style.marginTop = '10px';
    notificationArea.style.borderRadius = '5px';
    notificationArea.style.color = 'white';
    notificationArea.style.backgroundColor = type === 'success' ? 'green' : 'red';
  }
});