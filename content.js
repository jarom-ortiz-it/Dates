// Content script for the Chrome extension

console.log("Content script loaded");

// Configuration object for wait times and retry attempts (all times in milliseconds)
const config = {
    // Initial wait time after clicking the edit button before looking for the input field
    // Increase this if the page takes longer to load the editable fields
    initialWait: 5000,
  
    // Maximum time to wait for a single element to appear on the page
    // Adjust this if some elements consistently take longer to load
    elementWait: 10000,
  
    // Maximum number of retries when verifying if the input field has been updated
    // Increase this if the date picker sometimes takes longer to update the input field
    maxRetries: 15,
  
    // Maximum time to wait for the date picker to appear after focusing on the input
    // Increase this if the date picker consistently takes longer to open
    datePickerTimeout: 5000,
  
    // Time to wait between each retry when verifying input update
    // Decrease for faster checks, increase if it's causing performance issues
    retryInterval: 500,
  
    // Time to highlight the field after successful update
    // Adjust for visual feedback duration
    highlightDuration: 2000
};

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "updateDate") {
        console.log("Received updateDate request:", request);
        openEditorAndUpdateDate(request.field, request.date)
            .then((result) => {
                console.log("Update successful:", result);
                sendResponse({success: true, message: result});
            })
            .catch((error) => {
                console.error("Update failed:", error);
                sendResponse({success: false, error: error.message});
            });
        return true;  // Indicates we will send a response asynchronously
    }
});

async function openEditorAndUpdateDate(field, dateString) {
    console.log(`Starting openEditorAndUpdateDate for field ${field} with date ${dateString}`);
    try {
        await waitForPageLoad();

        console.log("Looking for edit button");
        const editButton = await waitForElement('.mdi-19px', config.initialWait);
        console.log("Edit button found, clicking");
        editButton.click();

        console.log("Waiting for input field");
        const input = await waitForElement(`input[data-field-name="${field}"]`, config.elementWait);
        if (!input) {
            throw new Error(`Input field not found: ${field}`);
        }
        console.log("Input field found");

        input.scrollIntoView({ behavior: 'smooth', block: 'center' });

        console.log("Focusing on input to open date picker");
        input.focus();
        await waitForDatePicker();
        console.log("Date picker is open");

        const [year, month, day] = dateString.split('-').map(Number);
        console.log(`Parsed date: year=${year}, month=${month}, day=${day}`);

        console.log("Attempting to set date in picker");
        await setDateInPicker(year, month, day);

        console.log("Verifying input field update");
        await verifyInputUpdate(input, year, month, day);

        console.log("Highlighting field");
        highlightField(input);

        return `Updated ${getFieldLabel(field)} to ${formatDateForInput(year, month, day)}`;
    } catch (error) {
        console.error("Error in openEditorAndUpdateDate:", error);
        throw error;
    }
}

function waitForPageLoad() {
    return new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve();
        } else {
            window.addEventListener('load', resolve);
        }
    });
}

async function waitForElement(selector, timeout = config.elementWait) {
    console.log(`Waiting for element: ${selector}`);
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) {
            console.log(`Element found: ${selector}`);
            return element;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.error(`Timed out waiting for element: ${selector}`);
    throw new Error(`Timed out waiting for element: ${selector}`);
}

async function waitForElements(selector, timeout = config.elementWait) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            return elements;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for elements: ${selector}`);
}

async function waitForDatePicker() {
    console.log("Waiting for date picker to appear");
    const selectors = [
        '.datepicker-dropdown',
        '.datepicker',
        '[class*="datepicker"]',
        '.date-picker',
        '.picker'
    ];
    
    const startTime = Date.now();
    while (Date.now() - startTime < config.datePickerTimeout) {
        for (let selector of selectors) {
            const element = document.querySelector(selector);
            if (element && window.getComputedStyle(element).display !== 'none') {
                console.log(`Date picker found with selector: ${selector}`);
                return element;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error("Date picker not found or not visible within timeout");
}

async function setDateInPicker(year, month, day) {
    console.log("Starting setDateInPicker");
    const datepicker = await waitForDatePicker();
    
    console.log("Setting month and year");
    const currentMonthYear = await waitForElement('.datepicker-switch, .picker-switch', config.elementWait, datepicker);
    currentMonthYear.click();
    await waitForElement('.datepicker-months, .picker-switch', config.elementWait, datepicker);
    currentMonthYear.click();
    await waitForElement('.datepicker-years, .year', config.elementWait, datepicker);
    
    await selectYearMonthDay(datepicker, year, month, day);
}

async function selectYearMonthDay(datepicker, year, month, day) {
    console.log(`Looking for year ${year}`);
    const yearSpan = Array.from(await waitForElements('.year', config.elementWait, datepicker))
        .find(el => el.textContent.trim() === year.toString());
    if (yearSpan) {
        yearSpan.click();
    } else {
        throw new Error(`Year ${year} not found in picker`);
    }
    
    console.log(`Looking for month ${month} (${getMonthShortName(month)})`);
    const monthSpan = Array.from(await waitForElements('.month', config.elementWait, datepicker))
        .find(el => el.textContent.trim() === getMonthShortName(month));
    if (monthSpan) {
        monthSpan.click();
    } else {
        throw new Error(`Month ${month} (${getMonthShortName(month)}) not found in picker`);
    }

    console.log(`Looking for day ${day}`);
    const dayElement = Array.from(await waitForElements('td.day:not(.old):not(.new)', config.elementWait, datepicker))
        .find(el => el.textContent.trim() === day.toString());
    if (dayElement) {
        dayElement.click();
    } else {
        throw new Error(`Day ${day} not found in picker`);
    }
    console.log("Date set in picker");
}

async function verifyInputUpdate(input, year, month, day) {
    const expectedValue = formatDateForInput(year, month, day);
    let retries = 0;
    while (retries < config.maxRetries) {
        if (input.value === expectedValue) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, config.retryInterval));
        retries++;
    }
    throw new Error(`Failed to update date in input field. Expected: ${expectedValue}, Got: ${input.value}`);
}

function formatDateForInput(year, month, day) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day.toString().padStart(2, '0')}-${monthNames[month-1]}-${year.toString().slice(-2)}`;
}

function getMonthShortName(monthNumber) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return monthNames[monthNumber - 1];
}

function highlightField(element) {
    const originalBackground = element.style.backgroundColor;
    element.style.backgroundColor = 'yellow';
    setTimeout(() => {
        element.style.backgroundColor = originalBackground;
    }, config.highlightDuration);
}

function getFieldLabel(fieldName) {
    const fieldLabels = {
        'Funding_Kickback_Resolved__c': 'Funding Kickback Resolved',
        'FSD_Status_Update__c': 'FSD Status Update'
    };
    return fieldLabels[fieldName] || fieldName;
}