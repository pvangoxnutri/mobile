const { createClient } = require('@supabase/supabase-js');

const url = 'https://eumlblwtjrrhzarvjvqq.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1bWxibHd0anJyaHphcnZqdnFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg5NTg2NSwiZXhwIjoyMDkwNDcxODY1fQ.wp3wMnidr-Wq__4LdGxggOUqQThB96kX4K-vm6ttKfk';

const client = createClient(url, key);

async function addColumn() {
  const { data, error } = await client
    .rpc('exec_sql', {
      sql: `ALTER TABLE "Trips" ADD COLUMN IF NOT EXISTS "CountriesJson" text NOT NULL DEFAULT '[]';`
    })
    .catch(e => ({ error: e }));

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Column added successfully!');
  }
}

addColumn();
