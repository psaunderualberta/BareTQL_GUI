<template>
    <NavBar>

        <template #logo>
            <h1>BareTQL</h1>
        </template>

        <template #activator>
            <p style="margin-top: 30px;"><u>Need Help?</u></p>
        </template>

        <template #header>
          <h2>Help Page</h2>
        </template>

        <template #content>
            <p>
                Welcome to BareTQL! BareTQL is a tool which provides the ability to 
                search through a data lake that either you or we provide in order to find similar
                rows to those deemed as 'interesting'. You can download our database file from (???). It has a size of 700MB, so make sure you have enough space to download it.
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
                        The first thing the user will use after importing their data is the keyword search. Enter a comma-separated list of keywords which you would like to search for in 
                        your database. The top 20 tables which contain at least one of the keywords will appear on the left side of your screen. Click on a table to see its rows, and then click on a row
                        to include it in your seed set. All of the rows selected in the seed set will appear on the right-hand side of the page, in no particular order. Once you are satisfied with your
                        selection of rows, click the 'Use as Seed Set' button to proceed to Set Expansion. <br><br>
                    </li>
                    <li>
                        Next, a you will be taken to the 'set expansion' page. There are a number of settings and options on this page, but the most important part is the button at the bottom of your screen
                        that says "Expand Rows (XR)". Once this button is pressed, BareTQL will search through the entire database that you imported and find the rows in the database which best match your seed set.
                        "Best Match" is a little ambiguous, but it suffices to say that BareTQL looks for tables containing columns that are in some way similar to the columns of your seed set. It then re-arranges
                        these columns so that they match up, and then ranks each row using a 'distance' metric. It then displays the top 10 rows that BareTQL identified as being the most likely to be related to your
                        seed set. <br><br>

                        Now, there are a few options that you can use to further refine the results of the set expansion. The most obvious is the large slider found above each column. This 'stickiness' slider is used
                        to calculate a single column's influence on the output of the set expansion. If one column has a value of '50', and another of '25', BareTQL will consider the column with '50' to be twice as important
                        as the column with '25', and will reflect this when ranking the output of the rows. Moreover, two columns labelled as '25% sticky' will together have the same influence as a single column with '50% sticky'.
                        Also, you can label a column as 'unique' or delete a column entirely. 'Unique' forces the rows returned by BareTQL to be unique in a particular column. Columns that are not tagged as 'unique' can 
                        have repeated values; only the 'unique' column(s) will be unique. 'Delete' is exactly what it sounds like: it deletes a column from the seed set, so that it has no influence on the output of the query. This can 
                        also be done by setting the slider value to '0% sticky', so only delete if you do not want the row represented in the expanded rows. Since deleting a column cannot be undone, an additional confirmation
                        step is necessary before deletion will occur. <br><br>

                        Multiple columns can be tagged as 'unique' simultaneously, and similarily with deleting columns.
                    </li>
                </ol>

                BareTQL was ultimately designed as a way to augment an existing dataset, rather than find a new one. However, don't let that stop you from simply playing around with your data or the data
                we have provided. Have fun, and thank you for using BareTQL!
            </p>
        </template>
    </NavBar>
</template>


<script>
import NavBar from './NavBar.vue'

export default {
    name: 'logo',
    components: {
        NavBar,
    },
}
</script>


<style scoped>

</style>