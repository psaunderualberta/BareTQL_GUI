<template>
    <Overtop>
        <template #logo>
            <h1>BareTQL</h1>
        </template>

        <template #activator>
            Need Help?
        </template>

        <template #header>
          <h2>Help Page</h2>
        </template>

        <template #content>
            <p>
                Welcome to BareTQL! BareTQL is a tool which provides the ability to 
                search through a data lake that either you or we provide in order to find similar
                rows to those deemed as 'interesting'. You can download our database file from (???). It has a size of 700MB.
                <br>
                There are two main components to BareTQL: 
                <ul>
                    <li>
                        Keyword Search, where you can selects the rows they find 'interesting' through the use of a search bar.
                    </li>
                    <li>
                        Set Expansion, where BareTQL will find and return rows in the data lake which are identified to be the most similar.
                        You can then adjust the settings for the set expansion, from setting the importance of different columns to defining unique columns or deleting them.
                    </li>
                </ul>
                Operation instructions are described below: 
                <ol>
                    <li>
                        The first thing the user will do after importing their data is the keyword search. Enter a comma-separated list of keywords which you would like to search for in 
                        your database. The top 20 tables which contain at least one of the keywords will appear on the left side of your screen. Click on a table to see its rows, and then click on a row
                        to include it in your seed set. All of the rows selected in the seed set will appear on the right-hand side of the page, in no particular order. Once you are satisfied with your
                        selection of rows, click the 'Use as Seed Set' button to proceed to Set Expansion.
                    </li>
                    <li>
                        (Revamp set expansion page before writing a guide for it.)
                    </li>
                </ol>

                BareTQL was ultimately designed as a way to augment an existing dataset, rather than find a new one. However, don't let that stop you from simply playing around with your data or the data
                we have provided. Have fun, and thank you for using BareTQL!
            </p>
        </template>
    </Overtop>
</template>


<script>
import Overtop from './Overtop.vue'

export default {
    name: 'logo',
    components: {
        Overtop,
    }
}
</script>


<style scoped>

</style>