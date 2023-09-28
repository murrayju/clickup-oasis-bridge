import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto(
    'https://forms.clickup.com/42113966/f/1856xe-21691/AU6S1VVI5U0ZMV77BY',
  );
});

test.describe('English Intake Form', () => {
  test('Individual', async ({ page }) => {
    await page
      .locator('[data-test="form__body-item__First Name"]')
      .getByPlaceholder('Enter text')
      .fill('Tester');
    await page
      .locator('[data-test="form__body-item__Last Name"]')
      .getByPlaceholder('Enter text')
      .fill('McTestface');
    await page
      .locator(
        '[data-test="form__body-item__Date of Birth Month \\(01-Jan\\, 02-Feb\\, 03-Mar\\, 04-April\\, etc\\)"] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: '07' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .locator(
        '[data-test="form__body-item__Date of Birth Day "] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: '27' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .locator(
        '[data-test="form__body-item__Date of Birth Year "] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: '1956' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .locator(
        '[data-test="form__body-item__Address Type"] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: 'Current Housing (House, Apt., etc.)' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .locator('[data-test="form__body-item__Address"]')
      .getByPlaceholder('Enter text')
      .fill('123 Fakeland Drive');
    await page
      .locator('[data-test="form__body-item__Apartment \\#"]')
      .getByPlaceholder('Enter text')
      .fill('77');
    await page
      .locator('[data-test="form__body-item__City"]')
      .getByPlaceholder('Enter text')
      .fill('Bobbiverse');
    await page
      .locator('[data-test="form__body-item__Zip Code"]')
      .getByPlaceholder('Enter text')
      .fill('99863');
    await page
      .locator(
        '[data-test="form__body-item__Phone Number"] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: 'Cell' })
      .locator('div')
      .nth(1)
      .click();
    await page.getByPlaceholder('Enter phone').click();
    await page.getByPlaceholder('(201) 555-0123').fill('(775) 961-4432');
    await page
      .getByPlaceholder('Your new Food Bank ID Card will be sent to this email')
      .fill('fake@email.com');
    await page
      .locator(
        '[data-test^="form__body-item__Gender"] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: '2-Male' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .locator(
        '[data-test^="form__body-item__Ethnicity"] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page.getByText('2. Asian', { exact: true }).click();
    // await page
    //   .locator(
    //     '[data-test="form__body-item__Primary Language"] [data-test="select__dropdown__toggle"]',
    //   )
    //   .click();
    // await page
    //   .getByRole('option', { name: 'English (English)' })
    //   .locator('div')
    //   .nth(1)
    //   .click();
    await page
      .locator(
        '[data-test="form__body-item__Total Number of People in Household"] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: 'Only me (1)' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .locator(
        '[data-test="form__body-item__\\*Select all that apply\\* Is anyone in the household\\.\\.\\. \\(1- Disabled\\, 2-Homeless\\, 3-Veteran\\, 4-Active Military or Dependant\\) "] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: '1- Disabled' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .getByRole('option', { name: '2- Homeless' })
      .locator('div')
      .nth(1)
      .click();
    await page.locator('[data-test="form__public-body"]').click();
    await page
      .locator(
        '[data-test="form__body-item__\\*Select all that apply\\* What benefits are your household already receiving\\? \\(1-Calfresh\\, 2-WIC\\, 3-Disability\\, 4-Medicare\\/Medi-Cal\\, 5- Social Security\\)"] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: '1- CalFresh' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .getByRole('option', { name: '5- Social Security' })
      .locator('div')
      .nth(1)
      .click();
    await page.locator('[data-test="form__public-body"]').click();
    await page.getByPlaceholder('Enter currency').fill('$12,345');
    await page.getByPlaceholder('Enter Proxy Name').fill('Sally');
    await page
      .locator(
        '[data-test="form__body-item__I understand that by typing my name on this electronic form\\, I am confirming that the information provided is accurate\\. I understand that the information provided will be entered into a secure\\, password - protected database that may be shared between all nonprofit food and diaper service providers and the Jacobs \\& Cushman San Diego Food Bank\\. This is not a government - run program\\/database\\. Information collected is for statistical reporting and funding purposes and will remain confidential to external parties\\. I understand that I cannot hold liable any organization for the food products obtained at this site\\; it is my discretion whether or not to consume the food products\\."] [data-test="select__dropdown__toggle"]',
      )
      .click();
    await page
      .getByRole('option', { name: 'Yes' })
      .locator('div')
      .nth(1)
      .click();
    await page
      .getByPlaceholder('Type First and Last Name Here')
      .fill('Tester McTestface');
  });
});
