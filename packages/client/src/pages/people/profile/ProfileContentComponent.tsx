import { AppBar, Button, createStyles, Tab, Tabs, withStyles, WithStyles } from "@material-ui/core";
import * as React from "react";
import { Route } from "react-router";
import { NavLink } from "react-router-dom";
import InfoSection from "./info_section/Container";
import ProductList from "./ProductListContainer";

interface IComponentProps extends WithStyles<typeof mainContentStyles> {
    id: string;
    editable: boolean;
}

class MainContent extends React.PureComponent<IComponentProps> {

    public render() {
        const { classes, id, editable } = this.props;
        return (
            <Route
                path={"/people/:id/:section?"}
                render={(props) => {

                    const section = props.match.params.section || "sales";

                    let innerComponent;
                    switch (section) {
                        case "sales":
                            innerComponent = <ProductList sellerID={id}/>;
                            break;
                        case "reviews":
                            innerComponent = <Filler/>;
                            break;
                        case "info":
                            innerComponent = <InfoSection userID={id} editable={editable}/>;
                    }

                    return (
                        <div>
                            <AppBar position={"static"} className={classes.tabs}>
                                <Tabs value={section}>
                                    <Tab
                                        value="sales"
                                        label="Items for Sale"
                                        component={(buttonProps: any) => (
                                            <NavLink
                                                to={`/people/${id}/sales`}
                                                {...buttonProps}
                                            />)}
                                    />
                                    <Tab
                                        value="reviews"
                                        label="Reviews"
                                        component={(buttonProps: any) => (
                                            <NavLink
                                                to={`/people/${id}/reviews`}
                                                {...buttonProps}
                                            />)}
                                    />
                                    <Tab
                                        value="info"
                                        label="Information"
                                        component={(buttonProps: any) => (
                                            <NavLink
                                                to={`/people/${id}/info`}
                                                {...buttonProps}
                                            />)}
                                    />
                                </Tabs>
                            </AppBar>
                            {innerComponent}
                    </div>
                );
                }}
            />
        );
        }
        }

const Filler = () =>  <div>Needs to be implemented</div>;

const mainContentStyles = createStyles({
    tabs: {
        marginBottom: "20px",
    },
});

export default withStyles(mainContentStyles)(MainContent);
