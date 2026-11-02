
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

async function main() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    );

    const bucket = 'attachments';
    const filePath =
        '82183c69-9bbf-4673-abab-42876e09c0ee/1748434429397.pdf';

    console.log('Bucket:', bucket);
    console.log('Path:', JSON.stringify(filePath));

    const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

    if (error) {
        console.error('Download failed:', error.message);
        console.error('Error details:', error);
        process.exitCode = 1;
        return;
    }

    console.log('Download successful!');
    console.log('File size:', data.size, 'bytes');
    console.log('File type:', data.type);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
